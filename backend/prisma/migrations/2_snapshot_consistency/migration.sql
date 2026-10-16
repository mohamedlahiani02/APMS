-- Correctness and concurrency defects reproduced by scripts/qa-load.mjs.
-- Applied migration 1 remains unchanged.
CREATE OR REPLACE PROCEDURE public.calculer_snapshot_mois(IN p_annee integer, IN p_mois integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Same transaction lock as the API stock ledger: no concurrent rebuilds,
    -- and no partial stock movement observed while deriving the monthly state.
    PERFORM pg_advisory_xact_lock(1095781715, 1);
    DELETE FROM analytics_stock_snapshot
    WHERE annee = p_annee AND mois = p_mois;

    INSERT INTO analytics_stock_snapshot (
        annee, mois, produit_id, magasin_id, fournisseur_id, famille_id,
        qte_achetee, qte_vendue, total_achat_ttc, total_vente_ttc, cmup_mois,
        qte_stock, cmup_cumule, valeur_stock, qte_deficit, nb_tx, statut, derniere_maj
    )
    WITH achats_mois AS (
        SELECT
            bal.produit_id, ba.magasin_id, ba.fournisseur_id,
            SUM(bal.qte_achetee)                                          AS qte_achetee,
            SUM(bal.prix_achat_total_ttc)                                 AS total_achat_ttc,
            CASE WHEN SUM(bal.qte_achetee) > 0
                 THEN SUM(bal.qte_achetee * bal.prix_achat_net_ht) / SUM(bal.qte_achetee)
                 ELSE NULL
            END                                                          AS cmup_mois,
            COUNT(*)                                                     AS nb_achat
        FROM bl_achat_lignes bal
        JOIN bl_achats ba ON ba.id = bal.bl_achat_id
        JOIN calendar  c  ON c.date_id = ba.date_id
        WHERE c.annee = p_annee AND c.mois = p_mois
          AND bal.deleted_at IS NULL AND ba.deleted_at IS NULL
        GROUP BY bal.produit_id, ba.magasin_id, ba.fournisseur_id
    ),
    ventes_mois AS (
        SELECT
            vl.produit_id, v.magasin_id,
            COALESCE(ba.fournisseur_id, '00000000-0000-0000-0000-000000000001'::uuid) AS fournisseur_id,
            SUM(vl.qte_vendue)                                           AS qte_vendue,
            SUM(vl.prix_vente_total_ttc)                                 AS total_vente_ttc,
            COUNT(*)                                                     AS nb_vente
        FROM vente_lignes vl
        JOIN ventes v ON v.id = vl.vente_id
        JOIN calendar c ON c.date_id = v.date_id
        LEFT JOIN bl_achat_lignes bal ON bal.id = vl.bl_achat_ligne_id
        LEFT JOIN bl_achats ba        ON ba.id  = bal.bl_achat_id
        WHERE c.annee = p_annee AND c.mois = p_mois
        GROUP BY vl.produit_id, v.magasin_id,
                 COALESCE(ba.fournisseur_id, '00000000-0000-0000-0000-000000000001'::uuid)
    ),
    achats_cumul AS (
        SELECT
            bal.produit_id, ba.magasin_id, ba.fournisseur_id,
            SUM(bal.qte_achetee)                                          AS qte_achetee_cumul,
            CASE WHEN SUM(bal.qte_achetee) > 0
                 THEN SUM(bal.qte_achetee * bal.prix_achat_net_ht) / SUM(bal.qte_achetee)
                 ELSE NULL
            END                                                          AS cmup_cumule
        FROM bl_achat_lignes bal
        JOIN bl_achats ba ON ba.id = bal.bl_achat_id
        JOIN calendar  c  ON c.date_id = ba.date_id
        WHERE (c.annee < p_annee OR (c.annee = p_annee AND c.mois <= p_mois))
          AND bal.deleted_at IS NULL AND ba.deleted_at IS NULL
        GROUP BY bal.produit_id, ba.magasin_id, ba.fournisseur_id
    ),
    -- qte_disponible is already reduced by covered legacy sales. Reconstruct
    -- the opening balance once, then subtract sales up to the requested month.
    -- Include later covered draws so historical months are not understated.
    legacy_draws AS (
        SELECT stock_legacy_lot_id,
               SUM(GREATEST(qte_vendue - qte_non_couverte, 0)) AS covered_draws
        FROM vente_lignes
        WHERE source_type = 'STOCK_LEGACY'
        GROUP BY stock_legacy_lot_id
    ),
    legacy_cumul AS (
        SELECT l.produit_id, l.magasin_id,
            '00000000-0000-0000-0000-000000000001'::uuid AS fournisseur_id,
            l.qte_disponible + COALESCE(d.covered_draws, 0) AS qte_achetee_cumul,
            l.cout_unitaire AS cmup_cumule
        FROM stock_legacy_lots l
        LEFT JOIN legacy_draws d ON d.stock_legacy_lot_id = l.id
        WHERE l.qte_disponible + COALESCE(d.covered_draws, 0) > 0
    ),
    achats_cumul_total AS (
        SELECT produit_id, magasin_id, fournisseur_id,
               SUM(qte_achetee_cumul)                                    AS qte_achetee_cumul,
               -- weighted CMUP across BL-cumulative and legacy baseline
               CASE WHEN SUM(qte_achetee_cumul) > 0
                    THEN SUM(qte_achetee_cumul * COALESCE(cmup_cumule, 0)) / SUM(qte_achetee_cumul)
                    ELSE NULL
               END                                                       AS cmup_cumule
        FROM (
            SELECT * FROM achats_cumul
            UNION ALL
            SELECT * FROM legacy_cumul
        ) both_sources
        GROUP BY produit_id, magasin_id, fournisseur_id
    ),
    ventes_cumul AS (
        SELECT
            vl.produit_id, v.magasin_id,
            COALESCE(ba.fournisseur_id, '00000000-0000-0000-0000-000000000001'::uuid) AS fournisseur_id,
            SUM(vl.qte_vendue)                                           AS qte_vendue_cumul
        FROM vente_lignes vl
        JOIN ventes v ON v.id = vl.vente_id
        JOIN calendar c ON c.date_id = v.date_id
        LEFT JOIN bl_achat_lignes bal ON bal.id = vl.bl_achat_ligne_id
        LEFT JOIN bl_achats ba        ON ba.id  = bal.bl_achat_id
        WHERE (c.annee < p_annee OR (c.annee = p_annee AND c.mois <= p_mois))
        GROUP BY vl.produit_id, v.magasin_id,
                 COALESCE(ba.fournisseur_id, '00000000-0000-0000-0000-000000000001'::uuid)
    ),
    cumul_fin_mois AS (
        SELECT
            COALESCE(a.produit_id, v.produit_id)         AS produit_id,
            COALESCE(a.magasin_id, v.magasin_id)          AS magasin_id,
            COALESCE(a.fournisseur_id, v.fournisseur_id)  AS fournisseur_id,
            COALESCE(a.qte_achetee_cumul, 0) - COALESCE(v.qte_vendue_cumul, 0) AS qte_stock_raw,
            a.cmup_cumule                                 AS cmup_cumule
        FROM achats_cumul_total a
        FULL OUTER JOIN ventes_cumul v
          ON  v.produit_id     = a.produit_id
          AND v.magasin_id     = a.magasin_id
          AND v.fournisseur_id = a.fournisseur_id
    )
    SELECT
        p_annee, p_mois,
        COALESCE(am.produit_id, vm.produit_id, k.produit_id)               AS produit_id,
        COALESCE(am.magasin_id, vm.magasin_id, k.magasin_id)                AS magasin_id,
        COALESCE(am.fournisseur_id, vm.fournisseur_id, k.fournisseur_id)   AS fournisseur_id,
        p.famille_id                                                       AS famille_id,
        COALESCE(am.qte_achetee, 0)                                        AS qte_achetee,
        COALESCE(vm.qte_vendue, 0)                                         AS qte_vendue,
        COALESCE(am.total_achat_ttc, 0)                                    AS total_achat_ttc,
        COALESCE(vm.total_vente_ttc, 0)                                    AS total_vente_ttc,
        am.cmup_mois                                                       AS cmup_mois,
        GREATEST(COALESCE(k.qte_stock_raw, 0), 0)                          AS qte_stock,
        k.cmup_cumule                                                      AS cmup_cumule,
        ROUND(GREATEST(COALESCE(k.qte_stock_raw, 0), 0) * COALESCE(k.cmup_cumule, 0), 3) AS valeur_stock,
        GREATEST(-COALESCE(k.qte_stock_raw, 0), 0)                         AS qte_deficit,
        (COALESCE(am.nb_achat, 0) + COALESCE(vm.nb_vente, 0))::INTEGER     AS nb_tx,
        'VALIDE'                                                           AS statut,
        NOW()                                                              AS derniere_maj
    FROM cumul_fin_mois k
    FULL OUTER JOIN achats_mois am
        ON  am.produit_id     = k.produit_id
        AND am.magasin_id     = k.magasin_id
        AND am.fournisseur_id = k.fournisseur_id
    FULL OUTER JOIN ventes_mois vm
        ON  vm.produit_id     = COALESCE(am.produit_id, k.produit_id)
        AND vm.magasin_id     = COALESCE(am.magasin_id, k.magasin_id)
        AND vm.fournisseur_id = COALESCE(am.fournisseur_id, k.fournisseur_id)
    JOIN produits p ON p.id = COALESCE(am.produit_id, vm.produit_id, k.produit_id)
    WHERE GREATEST(COALESCE(k.qte_stock_raw, 0), 0) > 0
       OR COALESCE(am.qte_achetee, 0) > 0
       OR COALESCE(vm.qte_vendue, 0)  > 0;

    INSERT INTO analytics_snapshot_state (annee, mois, statut, derniere_maj)
    VALUES (p_annee, p_mois, 'VALIDE', NOW())
    ON CONFLICT (annee, mois) DO UPDATE
       SET statut = 'VALIDE', derniere_maj = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_kpi_lines_for_month(p_annee integer, p_mois integer) RETURNS TABLE(produit_id uuid, magasin_id uuid, fournisseur_id uuid, famille_id uuid, qte_achetee numeric, qte_vendue numeric, total_achat_ttc numeric, total_vente_ttc numeric, cmup_mois numeric, qte_stock numeric, cmup_cumule numeric, valeur_stock numeric, qte_deficit numeric, nb_tx bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Recheck state only after acquiring the ledger lock. A second caller then
    -- observes the first caller's committed snapshot rather than rebuilding it.
    PERFORM pg_advisory_xact_lock(1095781715, 1);
    IF NOT EXISTS (SELECT 1 FROM analytics_snapshot_state s
                    WHERE s.annee = p_annee AND s.mois = p_mois
                      AND s.statut = 'VALIDE')
    THEN
        CALL calculer_snapshot_mois(p_annee, p_mois);
    END IF;

    RETURN QUERY
    SELECT
        s.produit_id, s.magasin_id, s.fournisseur_id, s.famille_id,
        s.qte_achetee, s.qte_vendue, s.total_achat_ttc, s.total_vente_ttc,
        s.cmup_mois, s.qte_stock, s.cmup_cumule, s.valeur_stock, s.qte_deficit, s.nb_tx::BIGINT
      FROM analytics_stock_snapshot s
     WHERE s.annee = p_annee AND s.mois = p_mois;
END;
$$;

-- Header-only edits must invalidate both the old and new calendar scopes.
CREATE OR REPLACE FUNCTION public.invalider_snapshot_entete() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE d integer; y integer; m integer;
BEGIN
    FOREACH d IN ARRAY ARRAY[OLD.date_id, NEW.date_id] LOOP
        SELECT annee, mois INTO y, m FROM calendar WHERE date_id = d;
        INSERT INTO analytics_snapshot_state(annee,mois,statut,derniere_maj)
        VALUES(y,m,'A_RECALCULER',NOW())
        ON CONFLICT(annee,mois) DO UPDATE SET statut='A_RECALCULER',derniere_maj=NOW();
        UPDATE analytics_snapshot_state SET statut='A_RECALCULER',derniere_maj=NOW()
        WHERE annee>y OR (annee=y AND mois>=m);
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_snapshot_bl_entete AFTER UPDATE OF date_id,magasin_id,fournisseur_id,deleted_at ON bl_achats
FOR EACH ROW WHEN (OLD.date_id IS DISTINCT FROM NEW.date_id OR OLD.magasin_id IS DISTINCT FROM NEW.magasin_id OR OLD.fournisseur_id IS DISTINCT FROM NEW.fournisseur_id OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
EXECUTE FUNCTION public.invalider_snapshot_entete();
CREATE TRIGGER trg_snapshot_vente_entete AFTER UPDATE OF date_id,magasin_id ON ventes
FOR EACH ROW WHEN (OLD.date_id IS DISTINCT FROM NEW.date_id OR OLD.magasin_id IS DISTINCT FROM NEW.magasin_id)
EXECUTE FUNCTION public.invalider_snapshot_entete();

CREATE OR REPLACE FUNCTION public.invalider_snapshot_famille() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE analytics_snapshot_state SET statut='A_RECALCULER',derniere_maj=NOW();
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_snapshot_produit_famille AFTER UPDATE OF famille_id ON produits
FOR EACH ROW WHEN (OLD.famille_id IS DISTINCT FROM NEW.famille_id)
EXECUTE FUNCTION public.invalider_snapshot_famille();

-- Derived cache only; no purchase, sale or legacy lot balances are modified.
UPDATE analytics_snapshot_state SET statut='A_RECALCULER',derniere_maj=NOW();
UPDATE analytics_stock_snapshot SET statut='A_RECALCULER',derniere_maj=NOW();
