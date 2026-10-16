import { pool } from "../db.js";
import type { LookupQuery } from "../common/pagination.js";
import type { StockQuery } from "./schemas.js";

export interface StockItem {
  produitId: string;
  produitReference: string;
  produitDesignation: string;
  magasinId: string;
  magasinNom: string;
  qteDisponible: number;
  valeur: number;
}

export interface LegacyLotLookupItem {
  id: string;
  produitId: string;
  produitLabel: string;
  magasinId: string;
  qteDisponible: number;
}

/**
 * Live "available stock" per produit+magasin. There is no maintained
 * current-stock table (the legacy `stock` table is frozen since 2026-07-15,
 * its `cmup` column unused), so this is computed on the fly as:
 *
 *   sum(bl_achat_lignes.qte_restante) for non-deleted lines/headers
 *   + stock_legacy_lots.qte_disponible
 *
 * grouped by produit+magasin, clamped at 0 for display. Implemented as a
 * single raw SQL query (two CTEs full-outer-joined on produit+magasin) rather
 * than a Prisma groupBy because the result also needs to merge two different
 * source tables before pagination/filtering, which Prisma's query builder
 * can't express in one round trip.
 *
 * `valeur` (not in the task's compute spec, but present in the API contract's
 * example shape) is the sum of each contributing lot's own valuation — BL
 * lines at `qte_restante * prix_achat_net_ht`, legacy lots at
 * `qte_disponible * cout_unitaire` — i.e. a straight lot-level valuation, not
 * a recomputed CMUP (the task explicitly says `stock.cmup` is unused/frozen).
 * This is an assumption; flagged in the handoff report.
 */
export async function listStock(
  query: StockQuery,
): Promise<{ content: StockItem[]; total: number }> {
  const search = query.search ?? null;
  const magasinId = query.magasinId ?? null;
  const limit = query.size;
  const offset = query.page * query.size;

  const sortFields: Record<string, string> = {
    reference: "p.reference",
    designation: "p.designation",
    magasin: "m.nom",
    qteDisponible: "qte_disponible",
    valeur: "valeur",
  };
  const sortField =
    query.sortBy && Object.hasOwn(sortFields, query.sortBy)
      ? sortFields[query.sortBy]
      : "p.reference";
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const sql = `
    WITH bl_stock AS (
      SELECT bl.magasin_id, bal.produit_id,
             SUM(bal.qte_restante) AS qte,
             SUM(bal.qte_restante * bal.prix_achat_net_ht) AS valeur
      FROM bl_achat_lignes bal
      JOIN bl_achats bl ON bl.id = bal.bl_achat_id
      WHERE bal.deleted_at IS NULL AND bl.deleted_at IS NULL
      GROUP BY bl.magasin_id, bal.produit_id
    ),
    legacy_stock AS (
      SELECT magasin_id, produit_id,
             SUM(qte_disponible) AS qte,
             SUM(qte_disponible * cout_unitaire) AS valeur
      FROM stock_legacy_lots
      GROUP BY magasin_id, produit_id
    ),
    combined AS (
      SELECT COALESCE(b.magasin_id, l.magasin_id) AS magasin_id,
             COALESCE(b.produit_id, l.produit_id) AS produit_id,
             COALESCE(b.qte, 0) + COALESCE(l.qte, 0) AS qte_raw,
             COALESCE(b.valeur, 0) + COALESCE(l.valeur, 0) AS valeur_raw
      FROM bl_stock b
      FULL OUTER JOIN legacy_stock l
        ON b.magasin_id = l.magasin_id AND b.produit_id = l.produit_id
    )
    SELECT
      c.produit_id,
      p.reference AS produit_reference,
      p.designation AS produit_designation,
      c.magasin_id,
      m.nom AS magasin_nom,
      GREATEST(c.qte_raw, 0) AS qte_disponible,
      GREATEST(c.valeur_raw, 0) AS valeur,
      COUNT(*) OVER() AS total_count
    FROM combined c
    JOIN produits p ON p.id = c.produit_id
    JOIN magasins m ON m.id = c.magasin_id
    WHERE ($1::uuid IS NULL OR c.magasin_id = $1::uuid)
      AND (
        $2::text IS NULL
        OR p.reference ILIKE '%' || $2 || '%'
        OR p.designation ILIKE '%' || $2 || '%'
      )
      AND ($5::uuid IS NULL OR p.famille_id = $5::uuid)
      AND ($6::text IS NULL OR ($6 = 'positive' AND c.qte_raw > 0) OR ($6 = 'zero' AND c.qte_raw <= 0))
    ORDER BY ${sortField} ${direction}, c.produit_id, c.magasin_id
    LIMIT $3 OFFSET $4
  `;

  const result = await pool.query(sql, [
    magasinId,
    search,
    limit,
    offset,
    query.familleId ?? null,
    query.availability ?? null,
  ]);
  // A window count has no row to travel with on an out-of-range page.
  // Fetch the first row only in that case to preserve truthful page metadata.
  const countSource =
    result.rows.length === 0 && offset > 0
      ? await pool.query(sql, [
          magasinId,
          search,
          1,
          0,
          query.familleId ?? null,
          query.availability ?? null,
        ])
      : result;
  const total = countSource.rows[0]
    ? Number(countSource.rows[0].total_count)
    : 0;
  const content: StockItem[] = result.rows.map((row) => ({
    produitId: row.produit_id,
    produitReference: row.produit_reference,
    produitDesignation: row.produit_designation,
    magasinId: row.magasin_id,
    magasinNom: row.magasin_nom,
    qteDisponible: Number(row.qte_disponible),
    valeur: Number(row.valeur),
  }));
  return { content, total };
}

/** `GET /stock/legacy-lots/lookup?q=&limit=` — search stock_legacy_lots by produit reference/designation. */
export async function lookupLegacyLots(
  query: LookupQuery,
): Promise<LegacyLotLookupItem[]> {
  const sql = `
    SELECT sll.id, sll.produit_id, p.reference, p.designation, sll.magasin_id, sll.qte_disponible
    FROM stock_legacy_lots sll
    JOIN produits p ON p.id = sll.produit_id
    WHERE (
      $1::text IS NULL
      OR p.reference ILIKE '%' || $1 || '%'
      OR p.designation ILIKE '%' || $1 || '%'
    )
    ORDER BY p.reference
    LIMIT $2
  `;
  const result = await pool.query(sql, [query.q ?? null, query.limit]);
  return result.rows.map((row) => ({
    id: row.id,
    produitId: row.produit_id,
    produitLabel: `${row.reference} - ${row.designation}`,
    magasinId: row.magasin_id,
    qteDisponible: Number(row.qte_disponible),
  }));
}
