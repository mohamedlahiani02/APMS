-- Original PostgreSQL 15 logic from the data-free handover schema.
-- Supplements 0_baseline without editing its already-applied checksum.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO public;

CREATE OR REPLACE PROCEDURE public.calculer_snapshot_mois(IN p_annee integer, IN p_mois integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
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
    -- Legacy lots count as "already there" in every month — flat addition to cumulative achat
    -- for the sentinel fournisseur grain, using stock_legacy_lots.cout_unitaire as its CMUP.
    legacy_cumul AS (
        SELECT
            produit_id, magasin_id,
            '00000000-0000-0000-0000-000000000001'::uuid                 AS fournisseur_id,
            qte_disponible                                               AS qte_achetee_cumul,
            cout_unitaire                                                AS cmup_cumule
        FROM stock_legacy_lots
        WHERE qte_disponible > 0
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



CREATE OR REPLACE FUNCTION public.invalider_snapshot_concerne() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_annee_modif    INTEGER;
    v_mois_modif     INTEGER;
    v_produit_id     UUID;
    v_magasin_id     UUID;
    v_fournisseur_id UUID;
BEGIN
    SELECT c.annee, c.mois
    INTO v_annee_modif, v_mois_modif
    FROM calendar c
    WHERE c.date_id = COALESCE(NEW.date_id, OLD.date_id);

    v_produit_id     := COALESCE(NEW.produit_id, OLD.produit_id);
    v_magasin_id     := COALESCE(NEW.magasin_id, OLD.magasin_id);
    v_fournisseur_id := COALESCE(NEW.fournisseur_id, OLD.fournisseur_id);

    -- Per-row marker (diagnostics + faithfulness to grain_mismatch_fix §7).
    UPDATE analytics_stock_snapshot
       SET statut = 'A_RECALCULER',
           derniere_maj = NOW()
     WHERE produit_id     = v_produit_id
       AND magasin_id     = v_magasin_id
       AND fournisseur_id = v_fournisseur_id
       AND (annee > v_annee_modif
            OR (annee = v_annee_modif AND mois >= v_mois_modif));

    -- Month-level state: the write's month must be recomputed; ALL later
    -- already-computed months also become dirty because residual stock from
    -- this write can propagate forward (covers new-tuple-in-later-month case).
    INSERT INTO analytics_snapshot_state (annee, mois, statut, derniere_maj)
    VALUES (v_annee_modif, v_mois_modif, 'A_RECALCULER', NOW())
    ON CONFLICT (annee, mois) DO UPDATE
       SET statut = 'A_RECALCULER', derniere_maj = NOW();

    UPDATE analytics_snapshot_state
       SET statut = 'A_RECALCULER', derniere_maj = NOW()
     WHERE statut = 'VALIDE'
       AND (annee > v_annee_modif
            OR (annee = v_annee_modif AND mois > v_mois_modif));

    RETURN COALESCE(NEW, OLD);
END;
$$;



CREATE OR REPLACE FUNCTION public.invalider_snapshot_concerne_v2() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_date_id     INTEGER;
    v_annee_modif INTEGER;
    v_mois_modif  INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'bl_achat_lignes' THEN
        SELECT ba.date_id INTO v_date_id
        FROM bl_achats ba WHERE ba.id = COALESCE(NEW.bl_achat_id, OLD.bl_achat_id);
    ELSIF TG_TABLE_NAME = 'vente_lignes' THEN
        SELECT v.date_id INTO v_date_id
        FROM ventes v WHERE v.id = COALESCE(NEW.vente_id, OLD.vente_id);
    END IF;

    SELECT c.annee, c.mois INTO v_annee_modif, v_mois_modif
    FROM calendar c WHERE c.date_id = v_date_id;

    IF v_annee_modif IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    INSERT INTO analytics_snapshot_state (annee, mois, statut, derniere_maj)
    VALUES (v_annee_modif, v_mois_modif, 'A_RECALCULER', NOW())
    ON CONFLICT (annee, mois) DO UPDATE
       SET statut = 'A_RECALCULER', derniere_maj = NOW();

    UPDATE analytics_snapshot_state
       SET statut = 'A_RECALCULER', derniere_maj = NOW()
     WHERE statut = 'VALIDE'
       AND (annee > v_annee_modif OR (annee = v_annee_modif AND mois > v_mois_modif));

    RETURN COALESCE(NEW, OLD);
END;
$$;



CREATE OR REPLACE PROCEDURE public.rafraichir_snapshots_invalides()
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_periode RECORD;
BEGIN
    FOR v_periode IN
        SELECT annee, mois
        FROM analytics_snapshot_state
        WHERE statut = 'A_RECALCULER'
        ORDER BY annee, mois
    LOOP
        CALL calculer_snapshot_mois(v_periode.annee, v_periode.mois);
    END LOOP;
END;
$$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_snapshot_state_mois_check' AND conrelid = 'public.analytics_snapshot_state'::regclass) THEN
    ALTER TABLE public.analytics_snapshot_state ADD CONSTRAINT analytics_snapshot_state_mois_check CHECK (((mois >= 1) AND (mois <= 12)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_snapstate_statut' AND conrelid = 'public.analytics_snapshot_state'::regclass) THEN
    ALTER TABLE public.analytics_snapshot_state ADD CONSTRAINT chk_snapstate_statut CHECK (((statut)::text = ANY ((ARRAY['VALIDE'::character varying, 'A_RECALCULER'::character varying])::text[])));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_stock_snapshot_mois_check' AND conrelid = 'public.analytics_stock_snapshot'::regclass) THEN
    ALTER TABLE public.analytics_stock_snapshot ADD CONSTRAINT analytics_stock_snapshot_mois_check CHECK (((mois >= 1) AND (mois <= 12)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_snap_statut' AND conrelid = 'public.analytics_stock_snapshot'::regclass) THEN
    ALTER TABLE public.analytics_stock_snapshot ADD CONSTRAINT chk_snap_statut CHECK (((statut)::text = ANY ((ARRAY['VALIDE'::character varying, 'A_RECALCULER'::character varying])::text[])));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_action_check' AND conrelid = 'public.audit_logs'::regclass) THEN
    ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check CHECK (((action)::text = ANY ((ARRAY['CREATE'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying, 'LOGIN'::character varying, 'LOGIN_FAILED'::character varying, 'LOGOUT'::character varying, 'LOCK'::character varying, 'UNLOCK'::character varying, 'PASSWORD_RESET'::character varying])::text[])));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_entity_type_check' AND conrelid = 'public.audit_logs'::regclass) THEN
    ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['TRANSACTION'::character varying, 'PRODUIT'::character varying, 'FAMILLE'::character varying, 'FOURNISSEUR'::character varying, 'MAGASIN'::character varying, 'USER'::character varying, 'STOCK'::character varying, 'AUTH'::character varying, 'BL_ACHAT'::character varying, 'VENTE'::character varying])::text[])));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bl_achat_lignes_prix_achat_net_ht_check' AND conrelid = 'public.bl_achat_lignes'::regclass) THEN
    ALTER TABLE public.bl_achat_lignes ADD CONSTRAINT bl_achat_lignes_prix_achat_net_ht_check CHECK ((prix_achat_net_ht >= (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bl_achat_lignes_qte_achetee_check' AND conrelid = 'public.bl_achat_lignes'::regclass) THEN
    ALTER TABLE public.bl_achat_lignes ADD CONSTRAINT bl_achat_lignes_qte_achetee_check CHECK ((qte_achetee >= (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bl_achat_lignes_qte_restante_check' AND conrelid = 'public.bl_achat_lignes'::regclass) THEN
    ALTER TABLE public.bl_achat_lignes ADD CONSTRAINT bl_achat_lignes_qte_restante_check CHECK ((qte_restante >= (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bl_achat_lignes_taux_tva_check' AND conrelid = 'public.bl_achat_lignes'::regclass) THEN
    ALTER TABLE public.bl_achat_lignes ADD CONSTRAINT bl_achat_lignes_taux_tva_check CHECK ((taux_tva = ANY (ARRAY[7, 13, 19])));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bal_total_formula' AND conrelid = 'public.bl_achat_lignes'::regclass) THEN
    ALTER TABLE public.bl_achat_lignes ADD CONSTRAINT chk_bal_total_formula CHECK ((prix_achat_total_ttc = round((prix_achat_ttc * qte_achetee), 3)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bal_ttc_formula' AND conrelid = 'public.bl_achat_lignes'::regclass) THEN
    ALTER TABLE public.bl_achat_lignes ADD CONSTRAINT chk_bal_ttc_formula CHECK ((prix_achat_ttc = round((prix_achat_net_ht * ((1)::numeric + ((taux_tva)::numeric / (100)::numeric))), 3)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bl_achats_bl_numero_check' AND conrelid = 'public.bl_achats'::regclass) THEN
    ALTER TABLE public.bl_achats ADD CONSTRAINT bl_achats_bl_numero_check CHECK (((length((bl_numero)::text) >= 1) AND (length((bl_numero)::text) <= 50)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_jour_semaine_check' AND conrelid = 'public.calendar'::regclass) THEN
    ALTER TABLE public.calendar ADD CONSTRAINT calendar_jour_semaine_check CHECK (((jour_semaine >= 1) AND (jour_semaine <= 7)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_mois_check' AND conrelid = 'public.calendar'::regclass) THEN
    ALTER TABLE public.calendar ADD CONSTRAINT calendar_mois_check CHECK (((mois >= 1) AND (mois <= 12)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_semaine_check' AND conrelid = 'public.calendar'::regclass) THEN
    ALTER TABLE public.calendar ADD CONSTRAINT calendar_semaine_check CHECK (((semaine >= 1) AND (semaine <= 53)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_semestre_check' AND conrelid = 'public.calendar'::regclass) THEN
    ALTER TABLE public.calendar ADD CONSTRAINT calendar_semestre_check CHECK ((semestre = ANY (ARRAY[1, 2])));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_trimestre_check' AND conrelid = 'public.calendar'::regclass) THEN
    ALTER TABLE public.calendar ADD CONSTRAINT calendar_trimestre_check CHECK ((trimestre = ANY (ARRAY[1, 2, 3, 4])));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_qte_integer' AND conrelid = 'public.stock'::regclass) THEN
    ALTER TABLE public.stock ADD CONSTRAINT chk_stock_qte_integer CHECK ((quantite_disponible = trunc(quantite_disponible)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_legacy_lots_cout_unitaire_check' AND conrelid = 'public.stock_legacy_lots'::regclass) THEN
    ALTER TABLE public.stock_legacy_lots ADD CONSTRAINT stock_legacy_lots_cout_unitaire_check CHECK ((cout_unitaire >= (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_legacy_lots_qte_disponible_check' AND conrelid = 'public.stock_legacy_lots'::regclass) THEN
    ALTER TABLE public.stock_legacy_lots ADD CONSTRAINT stock_legacy_lots_qte_disponible_check CHECK ((qte_disponible >= (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_bl_numero_length' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT chk_tx_bl_numero_length CHECK (((length((bl_numero)::text) >= 1) AND (length((bl_numero)::text) <= 50)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_prix_achat_net_ht_nonneg' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT chk_tx_prix_achat_net_ht_nonneg CHECK ((prix_achat_net_ht >= (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_qte_achetee_integer' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT chk_tx_qte_achetee_integer CHECK ((qte_achetee = trunc(qte_achetee)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_qte_achetee_nonneg' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT chk_tx_qte_achetee_nonneg CHECK ((qte_achetee >= (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_qte_vendue_integer' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT chk_tx_qte_vendue_integer CHECK (((qte_vendue IS NULL) OR (qte_vendue = trunc(qte_vendue))));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_taux_tva' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT chk_tx_taux_tva CHECK ((taux_tva = ANY (ARRAY[7, 13, 19])));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_total_formula' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT chk_tx_total_formula CHECK ((prix_achat_total_ttc = round((prix_achat_ttc * qte_achetee), 3)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_ttc_formula' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT chk_tx_ttc_formula CHECK ((prix_achat_ttc = round((prix_achat_net_ht * ((1)::numeric + ((taux_tva)::numeric / (100)::numeric))), 3)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_vente_consistency' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT chk_tx_vente_consistency CHECK ((((qte_vendue IS NULL) AND (prix_vente_ttc IS NULL) AND (prix_vente_total_ttc IS NULL)) OR ((qte_vendue IS NOT NULL) AND (prix_vente_ttc IS NOT NULL) AND (prix_vente_total_ttc IS NOT NULL))));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tx_vente_total_formula' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT chk_tx_vente_total_formula CHECK (((prix_vente_total_ttc IS NULL) OR (prix_vente_total_ttc = round((prix_vente_ttc * qte_vendue), 3))));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_prix_vente_ttc_check' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT transactions_prix_vente_ttc_check CHECK ((prix_vente_ttc > (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_qte_vendue_check' AND conrelid = 'public.transactions_legacy'::regclass) THEN
    ALTER TABLE public.transactions_legacy ADD CONSTRAINT transactions_qte_vendue_check CHECK ((qte_vendue > (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'SECRETAIRE'::character varying])::text[])));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vl_source_exclusive' AND conrelid = 'public.vente_lignes'::regclass) THEN
    ALTER TABLE public.vente_lignes ADD CONSTRAINT chk_vl_source_exclusive CHECK (((((source_type)::text = 'BL_LIGNE'::text) AND (bl_achat_ligne_id IS NOT NULL) AND (stock_legacy_lot_id IS NULL)) OR (((source_type)::text = 'STOCK_LEGACY'::text) AND (stock_legacy_lot_id IS NOT NULL) AND (bl_achat_ligne_id IS NULL))));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vl_total_formula' AND conrelid = 'public.vente_lignes'::regclass) THEN
    ALTER TABLE public.vente_lignes ADD CONSTRAINT chk_vl_total_formula CHECK ((prix_vente_total_ttc = round((prix_vente_ttc * qte_vendue), 3)));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vente_lignes_prix_vente_ttc_check' AND conrelid = 'public.vente_lignes'::regclass) THEN
    ALTER TABLE public.vente_lignes ADD CONSTRAINT vente_lignes_prix_vente_ttc_check CHECK ((prix_vente_ttc > (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vente_lignes_qte_non_couverte_check' AND conrelid = 'public.vente_lignes'::regclass) THEN
    ALTER TABLE public.vente_lignes ADD CONSTRAINT vente_lignes_qte_non_couverte_check CHECK ((qte_non_couverte >= (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vente_lignes_qte_vendue_check' AND conrelid = 'public.vente_lignes'::regclass) THEN
    ALTER TABLE public.vente_lignes ADD CONSTRAINT vente_lignes_qte_vendue_check CHECK ((qte_vendue > (0)::numeric));
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vente_lignes_source_type_check' AND conrelid = 'public.vente_lignes'::regclass) THEN
    ALTER TABLE public.vente_lignes ADD CONSTRAINT vente_lignes_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['BL_LIGNE'::character varying, 'STOCK_LEGACY'::character varying])::text[])));
  END IF;
END $migration$;

CREATE INDEX IF NOT EXISTS flyway_schema_history_s_idx ON public.flyway_schema_history USING btree (success);

CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs USING btree (action);

CREATE INDEX IF NOT EXISTS idx_audit_actor_id ON public.audit_logs USING btree (actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON public.audit_logs USING btree ("timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_audit_trace_id ON public.audit_logs USING btree (trace_id);

CREATE INDEX IF NOT EXISTS idx_bal_bl_achat_id ON public.bl_achat_lignes USING btree (bl_achat_id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_bal_produit_id ON public.bl_achat_lignes USING btree (produit_id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_calendar_annee_mois ON public.calendar USING btree (annee, mois);

CREATE INDEX IF NOT EXISTS idx_calendar_date_full ON public.calendar USING btree (date_full);

CREATE INDEX IF NOT EXISTS idx_familles_code ON public.familles USING btree (code);

CREATE INDEX IF NOT EXISTS idx_familles_is_active ON public.familles USING btree (is_active) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_fournisseurs_code ON public.fournisseurs USING btree (code);

CREATE INDEX IF NOT EXISTS idx_fournisseurs_is_active ON public.fournisseurs USING btree (is_active) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_magasins_is_active ON public.magasins USING btree (is_active) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_magasins_ville ON public.magasins USING btree (ville);

CREATE INDEX IF NOT EXISTS idx_produits_famille_id ON public.produits USING btree (famille_id);

CREATE INDEX IF NOT EXISTS idx_produits_is_active ON public.produits USING btree (is_active) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_produits_reference ON public.produits USING btree (reference) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.user_sessions USING btree (expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.user_sessions USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_snapshot_a_recalculer ON public.analytics_stock_snapshot USING btree (statut) WHERE ((statut)::text = 'A_RECALCULER'::text);

CREATE INDEX IF NOT EXISTS idx_snapshot_famille ON public.analytics_stock_snapshot USING btree (annee, mois, famille_id);

CREATE INDEX IF NOT EXISTS idx_snapshot_fournisseur ON public.analytics_stock_snapshot USING btree (annee, mois, fournisseur_id);

CREATE INDEX IF NOT EXISTS idx_snapshot_magasin ON public.analytics_stock_snapshot USING btree (annee, mois, magasin_id);

CREATE INDEX IF NOT EXISTS idx_snapshot_produit ON public.analytics_stock_snapshot USING btree (annee, mois, produit_id);

CREATE INDEX IF NOT EXISTS idx_snapstate_a_recalculer ON public.analytics_snapshot_state USING btree (statut) WHERE ((statut)::text = 'A_RECALCULER'::text);

CREATE INDEX IF NOT EXISTS idx_stock_magasin_id ON public.stock USING btree (magasin_id);

CREATE INDEX IF NOT EXISTS idx_stock_produit_id ON public.stock USING btree (produit_id);

CREATE INDEX IF NOT EXISTS idx_tx_created_by ON public.transactions_legacy USING btree (created_by) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_tx_date_id ON public.transactions_legacy USING btree (date_id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_tx_fournisseur_id ON public.transactions_legacy USING btree (fournisseur_id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_tx_magasin_id ON public.transactions_legacy USING btree (magasin_id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_tx_produit_id ON public.transactions_legacy USING btree (produit_id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_tx_stock_grain ON public.transactions_legacy USING btree (produit_id, magasin_id, fournisseur_id, date_id, id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_tx_transaction_date ON public.transactions_legacy USING btree (transaction_date) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users USING btree (email);

CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users USING btree (role);

CREATE INDEX IF NOT EXISTS idx_vl_bl_achat_ligne_id ON public.vente_lignes USING btree (bl_achat_ligne_id) WHERE (bl_achat_ligne_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_vl_depassement ON public.vente_lignes USING btree (depassement_stock) WHERE (depassement_stock = true);

CREATE INDEX IF NOT EXISTS idx_vl_produit_id ON public.vente_lignes USING btree (produit_id);

CREATE INDEX IF NOT EXISTS idx_vl_stock_legacy_lot_id ON public.vente_lignes USING btree (stock_legacy_lot_id) WHERE (stock_legacy_lot_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_vl_vente_id ON public.vente_lignes USING btree (vente_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fournisseurs_nom ON public.fournisseurs USING btree (nom) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_magasins_nom ON public.magasins USING btree (nom) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON public.users USING btree (email) WHERE (deleted_at IS NULL);

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invalider_snapshot_bl_achat_lignes' AND tgrelid = 'public.bl_achat_lignes'::regclass) THEN
    CREATE TRIGGER trg_invalider_snapshot_bl_achat_lignes AFTER INSERT OR DELETE OR UPDATE ON public.bl_achat_lignes FOR EACH ROW EXECUTE FUNCTION public.invalider_snapshot_concerne_v2();
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invalider_snapshot_vente_lignes' AND tgrelid = 'public.vente_lignes'::regclass) THEN
    CREATE TRIGGER trg_invalider_snapshot_vente_lignes AFTER INSERT OR DELETE OR UPDATE ON public.vente_lignes FOR EACH ROW EXECUTE FUNCTION public.invalider_snapshot_concerne_v2();
  END IF;
END $migration$;
