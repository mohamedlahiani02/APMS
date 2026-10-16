--
-- PostgreSQL database dump
--

-- Dumped from database version 15.13
-- Dumped by pg_dump version 15.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: calculer_snapshot_mois(integer, integer); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.calculer_snapshot_mois(IN p_annee integer, IN p_mois integer)
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


--
-- Name: get_kpi_lines_for_month(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_kpi_lines_for_month(p_annee integer, p_mois integer) RETURNS TABLE(produit_id uuid, magasin_id uuid, fournisseur_id uuid, famille_id uuid, qte_achetee numeric, qte_vendue numeric, total_achat_ttc numeric, total_vente_ttc numeric, cmup_mois numeric, qte_stock numeric, cmup_cumule numeric, valeur_stock numeric, qte_deficit numeric, nb_tx bigint)
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


--
-- Name: invalider_snapshot_concerne(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invalider_snapshot_concerne() RETURNS trigger
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


--
-- Name: invalider_snapshot_concerne_v2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invalider_snapshot_concerne_v2() RETURNS trigger
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


--
-- Name: rafraichir_snapshots_invalides(); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.rafraichir_snapshots_invalides()
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: analytics_snapshot_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_snapshot_state (
    annee integer NOT NULL,
    mois integer NOT NULL,
    statut character varying(20) DEFAULT 'A_RECALCULER'::character varying NOT NULL,
    derniere_maj timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analytics_snapshot_state_mois_check CHECK (((mois >= 1) AND (mois <= 12))),
    CONSTRAINT chk_snapstate_statut CHECK (((statut)::text = ANY ((ARRAY['VALIDE'::character varying, 'A_RECALCULER'::character varying])::text[])))
);


--
-- Name: TABLE analytics_snapshot_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.analytics_snapshot_state IS 'One row per (annee, mois). statut = VALIDE when analytics_stock_snapshot rows for that month are current; A_RECALCULER when invalidated by a write to transactions. Drives lazy recompute in get_kpi_lines_for_month().';


--
-- Name: analytics_stock_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_stock_snapshot (
    annee integer NOT NULL,
    mois integer NOT NULL,
    produit_id uuid NOT NULL,
    magasin_id uuid NOT NULL,
    fournisseur_id uuid NOT NULL,
    famille_id uuid NOT NULL,
    qte_achetee numeric(12,3) DEFAULT 0 NOT NULL,
    qte_vendue numeric(12,3) DEFAULT 0 NOT NULL,
    total_achat_ttc numeric(14,3) DEFAULT 0 NOT NULL,
    total_vente_ttc numeric(14,3) DEFAULT 0 NOT NULL,
    cmup_mois numeric(12,3),
    qte_stock numeric(12,3) NOT NULL,
    cmup_cumule numeric(12,3),
    valeur_stock numeric(14,3) NOT NULL,
    nb_tx integer DEFAULT 0 NOT NULL,
    statut character varying(20) DEFAULT 'VALIDE'::character varying NOT NULL,
    derniere_maj timestamp with time zone DEFAULT now() NOT NULL,
    qte_deficit numeric(12,3) DEFAULT 0 NOT NULL,
    CONSTRAINT analytics_stock_snapshot_mois_check CHECK (((mois >= 1) AND (mois <= 12))),
    CONSTRAINT chk_snap_statut CHECK (((statut)::text = ANY ((ARRAY['VALIDE'::character varying, 'A_RECALCULER'::character varying])::text[])))
);


--
-- Name: TABLE analytics_stock_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.analytics_stock_snapshot IS 'KPI snapshot per (annee, mois, produit, magasin, fournisseur). Grain per BUSINESS_RULES §5.2 (V7). NEVER read for operational stock — that remains served by `stock` (SR-002).';


--
-- Name: COLUMN analytics_stock_snapshot.qte_deficit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.analytics_stock_snapshot.qte_deficit IS 'Diagnostic only: cumulative sold quantity at this grain with no traceable purchase/legacy-lot origin (would have made qte_stock negative before clamping). Never subtracted from qte_vendue/total_vente_ttc — those always reflect the full real sale.';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid,
    action character varying(20) NOT NULL,
    actor_id uuid,
    actor_email character varying(255),
    actor_role character varying(20),
    summary text,
    changes jsonb,
    ip_address inet,
    trace_id character varying(100),
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_logs_action_check CHECK (((action)::text = ANY ((ARRAY['CREATE'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying, 'LOGIN'::character varying, 'LOGIN_FAILED'::character varying, 'LOGOUT'::character varying, 'LOCK'::character varying, 'UNLOCK'::character varying, 'PASSWORD_RESET'::character varying])::text[]))),
    CONSTRAINT audit_logs_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['TRANSACTION'::character varying, 'PRODUIT'::character varying, 'FAMILLE'::character varying, 'FOURNISSEUR'::character varying, 'MAGASIN'::character varying, 'USER'::character varying, 'STOCK'::character varying, 'AUTH'::character varying, 'BL_ACHAT'::character varying, 'VENTE'::character varying])::text[])))
);


--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_logs IS 'Append-only activity log (RI-003, AU-001..004). Records all CRUD on business entities + all auth events. Never UPDATE/DELETE rows.';


--
-- Name: COLUMN audit_logs.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.action IS 'CREATE/UPDATE/DELETE for business entities. LOGIN/LOGIN_FAILED/LOGOUT for auth. LOCK/UNLOCK/PASSWORD_RESET for user lifecycle.';


--
-- Name: COLUMN audit_logs.summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.summary IS 'Pre-rendered French summary (AU-002). Format patterns specified in BUSINESS_RULES_VF §8.3.';


--
-- Name: COLUMN audit_logs.changes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.changes IS 'Optional JSONB diff for UPDATE actions only. Null for CREATE/DELETE/LOGIN/LOGOUT/LOCK/UNLOCK/PASSWORD_RESET.';


--
-- Name: bl_achat_lignes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bl_achat_lignes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bl_achat_id uuid NOT NULL,
    produit_id uuid NOT NULL,
    qte_achetee numeric(12,3) NOT NULL,
    qte_restante numeric(12,3) NOT NULL,
    prix_achat_net_ht numeric(12,3) NOT NULL,
    taux_tva integer NOT NULL,
    prix_achat_ttc numeric(12,3) NOT NULL,
    prix_achat_total_ttc numeric(12,3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    CONSTRAINT bl_achat_lignes_prix_achat_net_ht_check CHECK ((prix_achat_net_ht >= (0)::numeric)),
    CONSTRAINT bl_achat_lignes_qte_achetee_check CHECK ((qte_achetee >= (0)::numeric)),
    CONSTRAINT bl_achat_lignes_qte_restante_check CHECK ((qte_restante >= (0)::numeric)),
    CONSTRAINT bl_achat_lignes_taux_tva_check CHECK ((taux_tva = ANY (ARRAY[7, 13, 19]))),
    CONSTRAINT chk_bal_total_formula CHECK ((prix_achat_total_ttc = round((prix_achat_ttc * qte_achetee), 3))),
    CONSTRAINT chk_bal_ttc_formula CHECK ((prix_achat_ttc = round((prix_achat_net_ht * ((1)::numeric + ((taux_tva)::numeric / (100)::numeric))), 3)))
);


--
-- Name: COLUMN bl_achat_lignes.qte_restante; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bl_achat_lignes.qte_restante IS 'qte_achetee minus everything drawn by vente_lignes so far. Clamped to >= 0 by CHECK; overselling past this is tracked on the vente_lignes side (depassement_stock/qte_non_couverte), never blocked here.';


--
-- Name: COLUMN bl_achat_lignes.taux_tva; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bl_achat_lignes.taux_tva IS 'Per-line TVA rate: 7, 13, or 19 percent. Not a per-BL rate — different products on the same BL can carry different rates.';


--
-- Name: bl_achats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bl_achats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_id integer NOT NULL,
    transaction_date date NOT NULL,
    bl_numero character varying(50) NOT NULL,
    magasin_id uuid NOT NULL,
    fournisseur_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    CONSTRAINT bl_achats_bl_numero_check CHECK (((length((bl_numero)::text) >= 1) AND (length((bl_numero)::text) <= 50)))
);


--
-- Name: TABLE bl_achats; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bl_achats IS 'Achat BL header — one row per Bon de Livraison. Multi-product via bl_achat_lignes. Soft-delete (achat side keeps the "correction" lifecycle, unlike ventes).';


--
-- Name: calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar (
    date_id integer NOT NULL,
    date_full date NOT NULL,
    annee integer NOT NULL,
    semestre integer NOT NULL,
    trimestre integer NOT NULL,
    mois integer NOT NULL,
    semaine integer NOT NULL,
    jour_semaine integer NOT NULL,
    nom_mois character varying(20) NOT NULL,
    nom_jour character varying(20) NOT NULL,
    est_weekend boolean DEFAULT false NOT NULL,
    CONSTRAINT calendar_jour_semaine_check CHECK (((jour_semaine >= 1) AND (jour_semaine <= 7))),
    CONSTRAINT calendar_mois_check CHECK (((mois >= 1) AND (mois <= 12))),
    CONSTRAINT calendar_semaine_check CHECK (((semaine >= 1) AND (semaine <= 53))),
    CONSTRAINT calendar_semestre_check CHECK ((semestre = ANY (ARRAY[1, 2]))),
    CONSTRAINT calendar_trimestre_check CHECK ((trimestre = ANY (ARRAY[1, 2, 3, 4])))
);


--
-- Name: TABLE calendar; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.calendar IS 'Pre-populated date dimension for time-series queries. Avoids repeated date arithmetic in analytics SQL';


--
-- Name: familles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.familles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(10) NOT NULL,
    nom character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid
);


--
-- Name: TABLE familles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.familles IS 'Product family referential (FA-001..005). Code is immutable after creation.';


--
-- Name: COLUMN familles.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.familles.code IS 'Texte libre 1..10 (sans espace côté service). Non-unique. Immuable après création (FA-001).';


--
-- Name: flyway_schema_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flyway_schema_history (
    installed_rank integer NOT NULL,
    version character varying(50),
    description character varying(200) NOT NULL,
    type character varying(20) NOT NULL,
    script character varying(1000) NOT NULL,
    checksum integer,
    installed_by character varying(100) NOT NULL,
    installed_on timestamp without time zone DEFAULT now() NOT NULL,
    execution_time integer NOT NULL,
    success boolean NOT NULL
);


--
-- Name: fournisseurs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fournisseurs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    nom character varying(200) NOT NULL,
    adresse text,
    telephone character varying(30),
    email character varying(255),
    contact_principal character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid
);


--
-- Name: TABLE fournisseurs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fournisseurs IS 'Supplier referential (FO-001..004). Code is immutable after creation. Row 00000000-0000-0000-0000-000000000001 is a fixed sentinel used only to attribute legacy-lot-sourced sales in KPI grain — never selectable for a new BL (is_active=false).';


--
-- Name: COLUMN fournisseurs.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fournisseurs.code IS 'Texte libre 1..20 (sans espace côté service). Non-unique. Immuable après création (FO-001).';


--
-- Name: magasins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magasins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    nom character varying(200) NOT NULL,
    adresse text,
    ville character varying(100),
    telephone character varying(30),
    responsable character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid
);


--
-- Name: TABLE magasins; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.magasins IS 'Physical store/warehouse locations (MA-001..004). Code is immutable after creation.';


--
-- Name: COLUMN magasins.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.magasins.code IS 'Texte libre 1..20 (sans espace côté service). Non-unique. Immuable après création (MA-001).';


--
-- Name: produits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference character varying(50) NOT NULL,
    designation character varying(200) NOT NULL,
    famille_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid
);


--
-- Name: TABLE produits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.produits IS 'Product catalog (PR-001..008). Reference is immutable after creation (PR-004).';


--
-- Name: COLUMN produits.reference; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produits.reference IS 'Texte libre 1..50 (sans espace côté service). Non-unique. Immuable après création (PR-004). PR-003 retirée (plus de contrainte de préfixe vs famille).';


--
-- Name: COLUMN produits.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produits.is_active IS 'TRUE: available for new transactions. FALSE (PR-007): hidden from new tx but historical data preserved.';


--
-- Name: stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produit_id uuid NOT NULL,
    magasin_id uuid NOT NULL,
    quantite_disponible numeric(12,3) DEFAULT 0 NOT NULL,
    cmup numeric(12,3) DEFAULT 0 NOT NULL,
    date_derniere_maj date DEFAULT CURRENT_DATE NOT NULL,
    CONSTRAINT chk_stock_qte_integer CHECK ((quantite_disponible = trunc(quantite_disponible)))
);


--
-- Name: TABLE stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock IS 'Current stock snapshot per product/store. Updated on every transaction insert/update. Holds the GLOBAL running CMUP (across all time). The dashboard "Valeur Stockée" KPI uses CMUP_mois (computed on the fly from monthly purchases) — NOT this column. See BUSINESS_RULES.md SR-002 / AR-005.';


--
-- Name: COLUMN stock.quantite_disponible; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock.quantite_disponible IS 'Can be negative if sales precede purchase recording (per launch doc §6 P2 — saisie corrective ultérieure).';


--
-- Name: COLUMN stock.cmup; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock.cmup IS 'Coût Moyen Unitaire Pondéré GLOBAL (HT, all-time). Formula on each purchase: (old_qty*old_cmup + new_qty*panet) / (old_qty + new_qty). Used for operational stock valuation, NOT for monthly KPIs.';


--
-- Name: stock_legacy_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_legacy_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produit_id uuid NOT NULL,
    magasin_id uuid NOT NULL,
    qte_disponible numeric(12,3) NOT NULL,
    cout_unitaire numeric(12,3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT stock_legacy_lots_cout_unitaire_check CHECK ((cout_unitaire >= (0)::numeric)),
    CONSTRAINT stock_legacy_lots_qte_disponible_check CHECK ((qte_disponible >= (0)::numeric))
);


--
-- Name: TABLE stock_legacy_lots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock_legacy_lots IS 'Stock with no traceable BL, seeded once from `stock` at V12 cutover. qte_disponible only ever decreases (drawn down by vente_lignes with source_type=STOCK_LEGACY); never replenished except by a new bl_achat (which uses bl_achat_lignes instead). cout_unitaire seeded from stock.cmup — used as the cost basis for margin KPIs on legacy sales.';


--
-- Name: transactions_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions_legacy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_id integer NOT NULL,
    transaction_date date NOT NULL,
    bl_numero character varying(50) NOT NULL,
    magasin_id uuid NOT NULL,
    fournisseur_id uuid NOT NULL,
    produit_id uuid NOT NULL,
    qte_achetee numeric(12,3) NOT NULL,
    prix_achat_net_ht numeric(12,3) NOT NULL,
    prix_achat_ttc numeric(12,3) NOT NULL,
    prix_achat_total_ttc numeric(12,3) NOT NULL,
    qte_vendue numeric(12,3),
    prix_vente_ttc numeric(12,3),
    prix_vente_total_ttc numeric(12,3),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_by uuid NOT NULL,
    updated_by uuid,
    deleted_by uuid,
    taux_tva integer DEFAULT 19 NOT NULL,
    CONSTRAINT chk_tx_bl_numero_length CHECK (((length((bl_numero)::text) >= 1) AND (length((bl_numero)::text) <= 50))),
    CONSTRAINT chk_tx_prix_achat_net_ht_nonneg CHECK ((prix_achat_net_ht >= (0)::numeric)),
    CONSTRAINT chk_tx_qte_achetee_integer CHECK ((qte_achetee = trunc(qte_achetee))),
    CONSTRAINT chk_tx_qte_achetee_nonneg CHECK ((qte_achetee >= (0)::numeric)),
    CONSTRAINT chk_tx_qte_vendue_integer CHECK (((qte_vendue IS NULL) OR (qte_vendue = trunc(qte_vendue)))),
    CONSTRAINT chk_tx_taux_tva CHECK ((taux_tva = ANY (ARRAY[7, 13, 19]))),
    CONSTRAINT chk_tx_total_formula CHECK ((prix_achat_total_ttc = round((prix_achat_ttc * qte_achetee), 3))),
    CONSTRAINT chk_tx_ttc_formula CHECK ((prix_achat_ttc = round((prix_achat_net_ht * ((1)::numeric + ((taux_tva)::numeric / (100)::numeric))), 3))),
    CONSTRAINT chk_tx_vente_consistency CHECK ((((qte_vendue IS NULL) AND (prix_vente_ttc IS NULL) AND (prix_vente_total_ttc IS NULL)) OR ((qte_vendue IS NOT NULL) AND (prix_vente_ttc IS NOT NULL) AND (prix_vente_total_ttc IS NOT NULL)))),
    CONSTRAINT chk_tx_vente_total_formula CHECK (((prix_vente_total_ttc IS NULL) OR (prix_vente_total_ttc = round((prix_vente_ttc * qte_vendue), 3)))),
    CONSTRAINT transactions_prix_vente_ttc_check CHECK ((prix_vente_ttc > (0)::numeric)),
    CONSTRAINT transactions_qte_vendue_check CHECK ((qte_vendue > (0)::numeric))
);


--
-- Name: TABLE transactions_legacy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transactions_legacy IS 'Frozen pre-V11 model. Superseded by bl_achats/bl_achat_lignes + ventes/vente_lignes. Kept for audit/history reference only — never written to after V12.';


--
-- Name: COLUMN transactions_legacy.bl_numero; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions_legacy.bl_numero IS 'Numéro de Bon de Livraison — texte libre 1..50 (sans espace côté service). Pas d''unicité.';


--
-- Name: COLUMN transactions_legacy.qte_achetee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions_legacy.qte_achetee IS 'Quantité achetée — entier ≥ 0. 0 = ligne vente-seule sur stock pré-existant (V6).';


--
-- Name: COLUMN transactions_legacy.prix_achat_net_ht; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions_legacy.prix_achat_net_ht IS 'Prix d''achat unitaire HT — ≥ 0. 0 autorisé uniquement quand qte_achetee = 0 (V6).';


--
-- Name: COLUMN transactions_legacy.prix_achat_ttc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions_legacy.prix_achat_ttc IS 'Stored computed: prix_achat_net_ht * (1 + taux_tva/100). DB CHECK constraint chk_tx_ttc_formula validates the formula.';


--
-- Name: COLUMN transactions_legacy.prix_achat_total_ttc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions_legacy.prix_achat_total_ttc IS 'Stored computed: prix_achat_ttc * qte_achetee.';


--
-- Name: COLUMN transactions_legacy.prix_vente_total_ttc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions_legacy.prix_vente_total_ttc IS 'Stored computed: prix_vente_ttc * qte_vendue.';


--
-- Name: COLUMN transactions_legacy.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions_legacy.deleted_at IS 'Soft delete for corrections. Deleted rows excluded from KPIs and stock computations.';


--
-- Name: COLUMN transactions_legacy.taux_tva; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions_legacy.taux_tva IS 'TVA rate in percent applied to this purchase: 7, 13, or 19. Determines prix_achat_ttc = ROUND(prix_achat_net_ht * (1 + taux_tva/100), 3).';


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    refresh_token_hash character varying(255) NOT NULL,
    ip_address inet,
    user_agent text,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_sessions IS 'JWT refresh token whitelist — allows server-side revocation';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    role character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    must_change_password boolean DEFAULT true NOT NULL,
    login_attempt_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    deleted_by uuid,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'SECRETAIRE'::character varying])::text[])))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.users IS 'Application users with RBAC roles. Soft-deletable.';


--
-- Name: COLUMN users.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.role IS 'ADMIN: full access. SECRETAIRE: transactions screen only — sees ALL transactions (UR-003 reversed in VF).';


--
-- Name: COLUMN users.must_change_password; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.must_change_password IS 'TRUE on creation (UR-006) and after admin reset (UR-010). Frontend redirects to /change-password if TRUE. Set to FALSE on first successful change-password.';


--
-- Name: COLUMN users.login_attempt_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.login_attempt_count IS 'Consecutive failed login attempts. Reset to 0 on success or after lockout window expires.';


--
-- Name: COLUMN users.locked_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.locked_until IS 'NOT NULL → account locked until this timestamp (UR-007). 5 failed attempts → 9-hour lockout.';


--
-- Name: vente_lignes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vente_lignes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vente_id uuid NOT NULL,
    produit_id uuid NOT NULL,
    source_type character varying(20) NOT NULL,
    bl_achat_ligne_id uuid,
    stock_legacy_lot_id uuid,
    qte_vendue numeric(12,3) NOT NULL,
    prix_vente_ttc numeric(12,3) NOT NULL,
    prix_vente_total_ttc numeric(12,3) NOT NULL,
    depassement_stock boolean DEFAULT false NOT NULL,
    qte_non_couverte numeric(12,3) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT chk_vl_source_exclusive CHECK (((((source_type)::text = 'BL_LIGNE'::text) AND (bl_achat_ligne_id IS NOT NULL) AND (stock_legacy_lot_id IS NULL)) OR (((source_type)::text = 'STOCK_LEGACY'::text) AND (stock_legacy_lot_id IS NOT NULL) AND (bl_achat_ligne_id IS NULL)))),
    CONSTRAINT chk_vl_total_formula CHECK ((prix_vente_total_ttc = round((prix_vente_ttc * qte_vendue), 3))),
    CONSTRAINT vente_lignes_prix_vente_ttc_check CHECK ((prix_vente_ttc > (0)::numeric)),
    CONSTRAINT vente_lignes_qte_non_couverte_check CHECK ((qte_non_couverte >= (0)::numeric)),
    CONSTRAINT vente_lignes_qte_vendue_check CHECK ((qte_vendue > (0)::numeric)),
    CONSTRAINT vente_lignes_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['BL_LIGNE'::character varying, 'STOCK_LEGACY'::character varying])::text[])))
);


--
-- Name: TABLE vente_lignes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vente_lignes IS 'One row per product per source in a vente. Manual lot selection only (no FIFO). depassement_stock=TRUE + qte_non_couverte>0 when qte_vendue exceeded what the source line/lot had available — allowed, never rejected. qte_non_couverte always counts in sales/revenue KPIs; it is excluded only from stock-quantity KPIs (which clamp at 0).';


--
-- Name: ventes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ventes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_id integer NOT NULL,
    vente_date date NOT NULL,
    magasin_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    created_by uuid,
    updated_by uuid
);


--
-- Name: TABLE ventes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ventes IS 'Vente header. Deliberately NO deleted_at: deletion is a real DELETE (cascades to vente_lignes), preceded by a confirmation popup client-side. This is the fix for the ghost-row-after-delete bug — soft-delete is not used here on purpose.';


--
-- Name: analytics_snapshot_state analytics_snapshot_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_snapshot_state
    ADD CONSTRAINT analytics_snapshot_state_pkey PRIMARY KEY (annee, mois);


--
-- Name: analytics_stock_snapshot analytics_stock_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_stock_snapshot
    ADD CONSTRAINT analytics_stock_snapshot_pkey PRIMARY KEY (annee, mois, produit_id, magasin_id, fournisseur_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bl_achat_lignes bl_achat_lignes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achat_lignes
    ADD CONSTRAINT bl_achat_lignes_pkey PRIMARY KEY (id);


--
-- Name: bl_achats bl_achats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achats
    ADD CONSTRAINT bl_achats_pkey PRIMARY KEY (id);


--
-- Name: calendar calendar_date_full_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar
    ADD CONSTRAINT calendar_date_full_key UNIQUE (date_full);


--
-- Name: calendar calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar
    ADD CONSTRAINT calendar_pkey PRIMARY KEY (date_id);


--
-- Name: familles familles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familles
    ADD CONSTRAINT familles_pkey PRIMARY KEY (id);


--
-- Name: flyway_schema_history flyway_schema_history_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flyway_schema_history
    ADD CONSTRAINT flyway_schema_history_pk PRIMARY KEY (installed_rank);


--
-- Name: fournisseurs fournisseurs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fournisseurs
    ADD CONSTRAINT fournisseurs_pkey PRIMARY KEY (id);


--
-- Name: magasins magasins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magasins
    ADD CONSTRAINT magasins_pkey PRIMARY KEY (id);


--
-- Name: produits produits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produits
    ADD CONSTRAINT produits_pkey PRIMARY KEY (id);


--
-- Name: stock_legacy_lots stock_legacy_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_legacy_lots
    ADD CONSTRAINT stock_legacy_lots_pkey PRIMARY KEY (id);


--
-- Name: stock stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_pkey PRIMARY KEY (id);


--
-- Name: transactions_legacy transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions_legacy
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: stock_legacy_lots uq_legacy_lot_produit_magasin; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_legacy_lots
    ADD CONSTRAINT uq_legacy_lot_produit_magasin UNIQUE (produit_id, magasin_id);


--
-- Name: user_sessions uq_sessions_token; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT uq_sessions_token UNIQUE (refresh_token_hash);


--
-- Name: stock uq_stock_produit_magasin; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT uq_stock_produit_magasin UNIQUE (produit_id, magasin_id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vente_lignes vente_lignes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vente_lignes
    ADD CONSTRAINT vente_lignes_pkey PRIMARY KEY (id);


--
-- Name: ventes ventes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventes
    ADD CONSTRAINT ventes_pkey PRIMARY KEY (id);


--
-- Name: flyway_schema_history_s_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flyway_schema_history_s_idx ON public.flyway_schema_history USING btree (success);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_actor_id ON public.audit_logs USING btree (actor_id);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_timestamp ON public.audit_logs USING btree ("timestamp" DESC);


--
-- Name: idx_audit_trace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_trace_id ON public.audit_logs USING btree (trace_id);


--
-- Name: idx_bal_bl_achat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bal_bl_achat_id ON public.bl_achat_lignes USING btree (bl_achat_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_bal_produit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bal_produit_id ON public.bl_achat_lignes USING btree (produit_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_calendar_annee_mois; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_annee_mois ON public.calendar USING btree (annee, mois);


--
-- Name: idx_calendar_date_full; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_date_full ON public.calendar USING btree (date_full);


--
-- Name: idx_familles_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_familles_code ON public.familles USING btree (code);


--
-- Name: idx_familles_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_familles_is_active ON public.familles USING btree (is_active) WHERE (deleted_at IS NULL);


--
-- Name: idx_fournisseurs_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fournisseurs_code ON public.fournisseurs USING btree (code);


--
-- Name: idx_fournisseurs_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fournisseurs_is_active ON public.fournisseurs USING btree (is_active) WHERE (deleted_at IS NULL);


--
-- Name: idx_magasins_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_magasins_is_active ON public.magasins USING btree (is_active) WHERE (deleted_at IS NULL);


--
-- Name: idx_magasins_ville; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_magasins_ville ON public.magasins USING btree (ville);


--
-- Name: idx_produits_famille_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produits_famille_id ON public.produits USING btree (famille_id);


--
-- Name: idx_produits_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produits_is_active ON public.produits USING btree (is_active) WHERE (deleted_at IS NULL);


--
-- Name: idx_produits_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produits_reference ON public.produits USING btree (reference) WHERE (deleted_at IS NULL);


--
-- Name: idx_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_expires_at ON public.user_sessions USING btree (expires_at);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_snapshot_a_recalculer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshot_a_recalculer ON public.analytics_stock_snapshot USING btree (statut) WHERE ((statut)::text = 'A_RECALCULER'::text);


--
-- Name: idx_snapshot_famille; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshot_famille ON public.analytics_stock_snapshot USING btree (annee, mois, famille_id);


--
-- Name: idx_snapshot_fournisseur; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshot_fournisseur ON public.analytics_stock_snapshot USING btree (annee, mois, fournisseur_id);


--
-- Name: idx_snapshot_magasin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshot_magasin ON public.analytics_stock_snapshot USING btree (annee, mois, magasin_id);


--
-- Name: idx_snapshot_produit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshot_produit ON public.analytics_stock_snapshot USING btree (annee, mois, produit_id);


--
-- Name: idx_snapstate_a_recalculer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapstate_a_recalculer ON public.analytics_snapshot_state USING btree (statut) WHERE ((statut)::text = 'A_RECALCULER'::text);


--
-- Name: idx_stock_magasin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_magasin_id ON public.stock USING btree (magasin_id);


--
-- Name: idx_stock_produit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_produit_id ON public.stock USING btree (produit_id);


--
-- Name: idx_tx_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tx_created_by ON public.transactions_legacy USING btree (created_by) WHERE (deleted_at IS NULL);


--
-- Name: idx_tx_date_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tx_date_id ON public.transactions_legacy USING btree (date_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_tx_fournisseur_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tx_fournisseur_id ON public.transactions_legacy USING btree (fournisseur_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_tx_magasin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tx_magasin_id ON public.transactions_legacy USING btree (magasin_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_tx_produit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tx_produit_id ON public.transactions_legacy USING btree (produit_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_tx_stock_grain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tx_stock_grain ON public.transactions_legacy USING btree (produit_id, magasin_id, fournisseur_id, date_id, id) WHERE (deleted_at IS NULL);


--
-- Name: idx_tx_transaction_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tx_transaction_date ON public.transactions_legacy USING btree (transaction_date) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_active ON public.users USING btree (is_active);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_vl_bl_achat_ligne_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vl_bl_achat_ligne_id ON public.vente_lignes USING btree (bl_achat_ligne_id) WHERE (bl_achat_ligne_id IS NOT NULL);


--
-- Name: idx_vl_depassement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vl_depassement ON public.vente_lignes USING btree (depassement_stock) WHERE (depassement_stock = true);


--
-- Name: idx_vl_produit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vl_produit_id ON public.vente_lignes USING btree (produit_id);


--
-- Name: idx_vl_stock_legacy_lot_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vl_stock_legacy_lot_id ON public.vente_lignes USING btree (stock_legacy_lot_id) WHERE (stock_legacy_lot_id IS NOT NULL);


--
-- Name: idx_vl_vente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vl_vente_id ON public.vente_lignes USING btree (vente_id);


--
-- Name: uq_fournisseurs_nom; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_fournisseurs_nom ON public.fournisseurs USING btree (nom) WHERE (deleted_at IS NULL);


--
-- Name: uq_magasins_nom; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_magasins_nom ON public.magasins USING btree (nom) WHERE (deleted_at IS NULL);


--
-- Name: uq_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_users_email ON public.users USING btree (email) WHERE (deleted_at IS NULL);


--
-- Name: bl_achat_lignes trg_invalider_snapshot_bl_achat_lignes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invalider_snapshot_bl_achat_lignes AFTER INSERT OR DELETE OR UPDATE ON public.bl_achat_lignes FOR EACH ROW EXECUTE FUNCTION public.invalider_snapshot_concerne_v2();


--
-- Name: vente_lignes trg_invalider_snapshot_vente_lignes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invalider_snapshot_vente_lignes AFTER INSERT OR DELETE OR UPDATE ON public.vente_lignes FOR EACH ROW EXECUTE FUNCTION public.invalider_snapshot_concerne_v2();


--
-- Name: analytics_stock_snapshot analytics_stock_snapshot_famille_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_stock_snapshot
    ADD CONSTRAINT analytics_stock_snapshot_famille_id_fkey FOREIGN KEY (famille_id) REFERENCES public.familles(id);


--
-- Name: analytics_stock_snapshot analytics_stock_snapshot_fournisseur_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_stock_snapshot
    ADD CONSTRAINT analytics_stock_snapshot_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id);


--
-- Name: analytics_stock_snapshot analytics_stock_snapshot_magasin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_stock_snapshot
    ADD CONSTRAINT analytics_stock_snapshot_magasin_id_fkey FOREIGN KEY (magasin_id) REFERENCES public.magasins(id);


--
-- Name: analytics_stock_snapshot analytics_stock_snapshot_produit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_stock_snapshot
    ADD CONSTRAINT analytics_stock_snapshot_produit_id_fkey FOREIGN KEY (produit_id) REFERENCES public.produits(id);


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: bl_achat_lignes bl_achat_lignes_bl_achat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achat_lignes
    ADD CONSTRAINT bl_achat_lignes_bl_achat_id_fkey FOREIGN KEY (bl_achat_id) REFERENCES public.bl_achats(id) ON DELETE CASCADE;


--
-- Name: bl_achat_lignes bl_achat_lignes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achat_lignes
    ADD CONSTRAINT bl_achat_lignes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: bl_achat_lignes bl_achat_lignes_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achat_lignes
    ADD CONSTRAINT bl_achat_lignes_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: bl_achat_lignes bl_achat_lignes_produit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achat_lignes
    ADD CONSTRAINT bl_achat_lignes_produit_id_fkey FOREIGN KEY (produit_id) REFERENCES public.produits(id);


--
-- Name: bl_achat_lignes bl_achat_lignes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achat_lignes
    ADD CONSTRAINT bl_achat_lignes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: bl_achats bl_achats_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achats
    ADD CONSTRAINT bl_achats_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: bl_achats bl_achats_date_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achats
    ADD CONSTRAINT bl_achats_date_id_fkey FOREIGN KEY (date_id) REFERENCES public.calendar(date_id);


--
-- Name: bl_achats bl_achats_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achats
    ADD CONSTRAINT bl_achats_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: bl_achats bl_achats_fournisseur_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achats
    ADD CONSTRAINT bl_achats_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id);


--
-- Name: bl_achats bl_achats_magasin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achats
    ADD CONSTRAINT bl_achats_magasin_id_fkey FOREIGN KEY (magasin_id) REFERENCES public.magasins(id);


--
-- Name: bl_achats bl_achats_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_achats
    ADD CONSTRAINT bl_achats_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: familles familles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familles
    ADD CONSTRAINT familles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: familles familles_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familles
    ADD CONSTRAINT familles_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: familles familles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familles
    ADD CONSTRAINT familles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: fournisseurs fournisseurs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fournisseurs
    ADD CONSTRAINT fournisseurs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: fournisseurs fournisseurs_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fournisseurs
    ADD CONSTRAINT fournisseurs_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: fournisseurs fournisseurs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fournisseurs
    ADD CONSTRAINT fournisseurs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: magasins magasins_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magasins
    ADD CONSTRAINT magasins_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: magasins magasins_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magasins
    ADD CONSTRAINT magasins_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: magasins magasins_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magasins
    ADD CONSTRAINT magasins_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: produits produits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produits
    ADD CONSTRAINT produits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: produits produits_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produits
    ADD CONSTRAINT produits_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: produits produits_famille_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produits
    ADD CONSTRAINT produits_famille_id_fkey FOREIGN KEY (famille_id) REFERENCES public.familles(id);


--
-- Name: produits produits_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produits
    ADD CONSTRAINT produits_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: stock_legacy_lots stock_legacy_lots_magasin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_legacy_lots
    ADD CONSTRAINT stock_legacy_lots_magasin_id_fkey FOREIGN KEY (magasin_id) REFERENCES public.magasins(id);


--
-- Name: stock_legacy_lots stock_legacy_lots_produit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_legacy_lots
    ADD CONSTRAINT stock_legacy_lots_produit_id_fkey FOREIGN KEY (produit_id) REFERENCES public.produits(id);


--
-- Name: stock stock_magasin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_magasin_id_fkey FOREIGN KEY (magasin_id) REFERENCES public.magasins(id);


--
-- Name: stock stock_produit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_produit_id_fkey FOREIGN KEY (produit_id) REFERENCES public.produits(id);


--
-- Name: transactions_legacy transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions_legacy
    ADD CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: transactions_legacy transactions_date_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions_legacy
    ADD CONSTRAINT transactions_date_id_fkey FOREIGN KEY (date_id) REFERENCES public.calendar(date_id);


--
-- Name: transactions_legacy transactions_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions_legacy
    ADD CONSTRAINT transactions_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: transactions_legacy transactions_fournisseur_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions_legacy
    ADD CONSTRAINT transactions_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id);


--
-- Name: transactions_legacy transactions_magasin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions_legacy
    ADD CONSTRAINT transactions_magasin_id_fkey FOREIGN KEY (magasin_id) REFERENCES public.magasins(id);


--
-- Name: transactions_legacy transactions_produit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions_legacy
    ADD CONSTRAINT transactions_produit_id_fkey FOREIGN KEY (produit_id) REFERENCES public.produits(id);


--
-- Name: transactions_legacy transactions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions_legacy
    ADD CONSTRAINT transactions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: users users_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: users users_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: vente_lignes vente_lignes_bl_achat_ligne_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vente_lignes
    ADD CONSTRAINT vente_lignes_bl_achat_ligne_id_fkey FOREIGN KEY (bl_achat_ligne_id) REFERENCES public.bl_achat_lignes(id);


--
-- Name: vente_lignes vente_lignes_produit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vente_lignes
    ADD CONSTRAINT vente_lignes_produit_id_fkey FOREIGN KEY (produit_id) REFERENCES public.produits(id);


--
-- Name: vente_lignes vente_lignes_stock_legacy_lot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vente_lignes
    ADD CONSTRAINT vente_lignes_stock_legacy_lot_id_fkey FOREIGN KEY (stock_legacy_lot_id) REFERENCES public.stock_legacy_lots(id);


--
-- Name: vente_lignes vente_lignes_vente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vente_lignes
    ADD CONSTRAINT vente_lignes_vente_id_fkey FOREIGN KEY (vente_id) REFERENCES public.ventes(id) ON DELETE CASCADE;


--
-- Name: ventes ventes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventes
    ADD CONSTRAINT ventes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: ventes ventes_date_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventes
    ADD CONSTRAINT ventes_date_id_fkey FOREIGN KEY (date_id) REFERENCES public.calendar(date_id);


--
-- Name: ventes ventes_magasin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventes
    ADD CONSTRAINT ventes_magasin_id_fkey FOREIGN KEY (magasin_id) REFERENCES public.magasins(id);


--
-- Name: ventes ventes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventes
    ADD CONSTRAINT ventes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--
