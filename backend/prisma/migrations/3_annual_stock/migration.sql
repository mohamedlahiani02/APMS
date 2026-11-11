CREATE TABLE stock_years (
 annee integer PRIMARY KEY CHECK(annee BETWEEN 1970 AND 2200),
 mode varchar(10) NOT NULL CHECK(mode IN ('LEGACY','CARRY','MANUAL')),
 statut varchar(10) NOT NULL DEFAULT 'OPEN' CHECK(statut IN ('OPEN','CLOSED')),
 needs_review boolean NOT NULL DEFAULT false,
 opened_at timestamptz NOT NULL DEFAULT now(),closed_at timestamptz
);
INSERT INTO stock_years(annee,mode) SELECT DISTINCT y,'LEGACY' FROM (
 SELECT extract(year FROM transaction_date)::int y FROM bl_achats UNION SELECT extract(year FROM vente_date)::int FROM ventes
 UNION SELECT extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::int WHERE NOT EXISTS(SELECT 1 FROM bl_achats) AND NOT EXISTS(SELECT 1 FROM ventes)
) s;
CREATE TABLE annual_stock_opening (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),annee integer NOT NULL REFERENCES stock_years(annee),
 produit_id uuid NOT NULL REFERENCES produits(id),magasin_id uuid NOT NULL REFERENCES magasins(id),
 qte_ouverture numeric(12,3) NOT NULL CHECK(qte_ouverture>=0),qte_restante numeric(12,3) NOT NULL CHECK(qte_restante>=0 AND qte_restante<=qte_ouverture),
 cout_unitaire numeric(12,3) NOT NULL CHECK(cout_unitaire>=0),UNIQUE(annee,produit_id,magasin_id)
);
ALTER TABLE vente_lignes ADD COLUMN annual_opening_id uuid REFERENCES annual_stock_opening(id);
CREATE INDEX idx_vl_annual_opening ON vente_lignes(annual_opening_id);
ALTER TABLE vente_lignes DROP CONSTRAINT chk_vl_source_exclusive;
ALTER TABLE vente_lignes ADD CONSTRAINT chk_vl_source_exclusive CHECK(
 (source_type='BL_LIGNE' AND bl_achat_ligne_id IS NOT NULL AND stock_legacy_lot_id IS NULL AND annual_opening_id IS NULL) OR
 (source_type='STOCK_LEGACY' AND stock_legacy_lot_id IS NOT NULL AND bl_achat_ligne_id IS NULL AND annual_opening_id IS NULL) OR
 (source_type='OPENING' AND annual_opening_id IS NOT NULL AND bl_achat_ligne_id IS NULL AND stock_legacy_lot_id IS NULL));
-- Existing source_type checks may be named differently across the baseline restore.
DO $$ DECLARE c record; BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='vente_lignes'::regclass AND contype='c' AND conname<>'chk_vl_source_exclusive' AND pg_get_constraintdef(oid) LIKE '%source_type%' LOOP EXECUTE format('ALTER TABLE vente_lignes DROP CONSTRAINT %I',c.conname); END LOOP; END $$;
CREATE FUNCTION apms_assert_year_write(d date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE y stock_years; BEGIN
 SELECT * INTO y FROM stock_years WHERE annee=extract(year FROM d)::int;
 IF NOT FOUND THEN RAISE EXCEPTION 'YEAR_NOT_OPEN: %',extract(year FROM d)::int; END IF;
 IF y.statut='CLOSED' THEN RAISE EXCEPTION 'YEAR_CLOSED: %',y.annee; END IF;
 IF y.needs_review THEN RAISE EXCEPTION 'YEAR_OPENING_REVIEW_REQUIRED: %',y.annee; END IF;
END $$;
CREATE FUNCTION apms_guard_year() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_date date; new_date date; source_year int;
BEGIN
 IF TG_TABLE_NAME='bl_achats' THEN
  IF TG_OP<>'INSERT' THEN old_date:=OLD.transaction_date; END IF;
  IF TG_OP<>'DELETE' THEN new_date:=NEW.transaction_date; END IF;
 ELSIF TG_TABLE_NAME='ventes' THEN
  IF TG_OP<>'INSERT' THEN old_date:=OLD.vente_date; END IF;
  IF TG_OP<>'DELETE' THEN new_date:=NEW.vente_date; END IF;
 ELSIF TG_TABLE_NAME='bl_achat_lignes' THEN
  IF TG_OP<>'INSERT' THEN SELECT transaction_date INTO old_date FROM bl_achats WHERE id=OLD.bl_achat_id; END IF;
  IF TG_OP<>'DELETE' THEN SELECT transaction_date INTO new_date FROM bl_achats WHERE id=NEW.bl_achat_id; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN SELECT vente_date INTO old_date FROM ventes WHERE id=OLD.vente_id; END IF;
  IF TG_OP<>'DELETE' THEN
   SELECT vente_date INTO new_date FROM ventes WHERE id=NEW.vente_id;
   IF NEW.source_type='OPENING' THEN SELECT annee INTO source_year FROM annual_stock_opening WHERE id=NEW.annual_opening_id;
   ELSIF NEW.source_type='BL_LIGNE' THEN SELECT extract(year FROM b.transaction_date)::int INTO source_year FROM bl_achat_lignes l JOIN bl_achats b ON b.id=l.bl_achat_id WHERE l.id=NEW.bl_achat_ligne_id; END IF;
   IF EXISTS(SELECT 1 FROM stock_years WHERE annee=extract(year FROM new_date)::int AND mode<>'LEGACY') AND (NEW.source_type='STOCK_LEGACY' AND NEW.qte_non_couverte<>NEW.qte_vendue OR source_year IS NOT NULL AND source_year<>extract(year FROM new_date)::int) THEN RAISE EXCEPTION 'YEAR_STOCK_SOURCE_MISMATCH'; END IF;
  END IF;
 END IF;
 IF old_date IS NOT NULL THEN PERFORM apms_assert_year_write(old_date); END IF;
 IF new_date IS NOT NULL THEN PERFORM apms_assert_year_write(new_date); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER guard_bl_year BEFORE INSERT OR UPDATE OR DELETE ON bl_achats FOR EACH ROW EXECUTE FUNCTION apms_guard_year();
CREATE TRIGGER guard_bl_line_year BEFORE INSERT OR UPDATE OR DELETE ON bl_achat_lignes FOR EACH ROW EXECUTE FUNCTION apms_guard_year();
CREATE TRIGGER guard_sale_year BEFORE INSERT OR UPDATE OR DELETE ON ventes FOR EACH ROW EXECUTE FUNCTION apms_guard_year();
CREATE TRIGGER guard_sale_line_year BEFORE INSERT OR UPDATE OR DELETE ON vente_lignes FOR EACH ROW EXECUTE FUNCTION apms_guard_year();

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
        WHERE (c.annee < p_annee AND NOT EXISTS(SELECT 1 FROM stock_years WHERE annee=p_annee AND mode<>'LEGACY') OR (c.annee = p_annee AND c.mois <= p_mois))
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
        WHERE l.qte_disponible + COALESCE(d.covered_draws, 0) > 0 AND NOT EXISTS(SELECT 1 FROM stock_years WHERE annee=p_annee AND mode<>'LEGACY')
        UNION ALL
        SELECT produit_id,magasin_id,'00000000-0000-0000-0000-000000000001'::uuid,qte_ouverture,cout_unitaire FROM annual_stock_opening WHERE annee=p_annee AND qte_ouverture>0
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
        WHERE (c.annee < p_annee AND NOT EXISTS(SELECT 1 FROM stock_years WHERE annee=p_annee AND mode<>'LEGACY') OR (c.annee = p_annee AND c.mois <= p_mois))
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


UPDATE analytics_snapshot_state SET statut='A_RECALCULER';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='apms_app') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON stock_years,annual_stock_opening TO apms_app;
 GRANT EXECUTE ON FUNCTION apms_assert_year_write(date),apms_guard_year() TO apms_app;
END IF; END $$;
