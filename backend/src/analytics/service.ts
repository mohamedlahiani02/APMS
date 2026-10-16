import { pool, prisma } from "../db.js";
import {
  ResourceNotFoundException,
  ValidationException,
} from "../common/errors.js";
import type { DrilldownDimension } from "./schemas.js";

/**
 * All the hard aggregation math lives in PostgreSQL already (the analytics
 * stored functions are part of the restored schema). This domain never
 * reimplements that math — it calls `get_kpi_lines_for_month` via the raw
 * `pool` and does only presentation-level grouping/formatting in TypeScript.
 *
 * `get_kpi_lines_for_month(year, month)` returns one row per
 * produit x magasin x fournisseur x famille combination for that month:
 *   produit_id, magasin_id, fournisseur_id, famille_id,
 *   qte_achetee, qte_vendue, total_achat_ttc, total_vente_ttc,
 *   cmup_mois, qte_stock, cmup_cumule, valeur_stock, qte_deficit, nb_tx
 * It lazily triggers `calculer_snapshot_mois` internally if that month isn't
 * VALIDE yet, so it is never called directly here.
 */
interface KpiRow {
  produit_id: string;
  magasin_id: string;
  fournisseur_id: string;
  famille_id: string;
  qte_achetee: string;
  qte_vendue: string;
  total_achat_ttc: string;
  total_vente_ttc: string;
  cmup_mois: string | null;
  qte_stock: string;
  cmup_cumule: string | null;
  valeur_stock: string;
  qte_deficit: string;
  nb_tx: string;
}

export interface AnalyticsScope {
  magasinId?: string;
  familleId?: string;
  fournisseurId?: string;
}
async function fetchKpiLines(
  year: number,
  month: number,
  scope: AnalyticsScope = {},
): Promise<KpiRow[]> {
  const result = await pool.query(
    "SELECT * FROM get_kpi_lines_for_month($1, $2)",
    [year, month],
  );
  return (result.rows as KpiRow[]).filter(
    (row) =>
      (!scope.magasinId || row.magasin_id === scope.magasinId) &&
      (!scope.familleId || row.famille_id === scope.familleId) &&
      (!scope.fournisseurId || row.fournisseur_id === scope.fournisseurId),
  );
}

function toNum(value: string | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Current year/month in the business timezone (Africa/Tunis), used for the future-period guard. */
function currentYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

function assertNotFuturePeriod(year: number, month: number): void {
  const { year: curYear, month: curMonth } = currentYearMonth();
  if (year > curYear || (year === curYear && month > curMonth)) {
    throw new ValidationException("La période demandée est dans le futur.", {
      year,
      month,
    });
  }
}

/** Not explicitly required by the task for annual-report, but added for consistency/sanity. */
function assertNotFutureYear(year: number): void {
  const { year: curYear } = currentYearMonth();
  if (year > curYear) {
    throw new ValidationException("L'année demandée est dans le futur.", {
      year,
    });
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/** French month name, capitalized (e.g. "Janvier"), computed in UTC to avoid local-timezone month drift. */
function frMonthLabel(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  const raw = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return capitalize(raw);
}

interface Agg {
  totalAchat: number;
  totalVente: number;
  totalValeur: number;
  nbTx: number;
}

function emptyAgg(): Agg {
  return { totalAchat: 0, totalVente: 0, totalValeur: 0, nbTx: 0 };
}

function addInto(
  agg: Agg,
  achat: number,
  vente: number,
  valeur: number,
  tx: number,
): void {
  agg.totalAchat += achat;
  agg.totalVente += vente;
  agg.totalValeur += valeur;
  agg.nbTx += tx;
}

function getOrInit(map: Map<string, Agg>, id: string): Agg {
  let agg = map.get(id);
  if (!agg) {
    agg = emptyAgg();
    map.set(id, agg);
  }
  return agg;
}

interface Aggregated {
  totals: Agg;
  byFournisseur: Map<string, Agg>;
  byFamille: Map<string, Agg>;
  byMagasin: Map<string, Agg>;
}

function aggregateRows(rows: KpiRow[]): Aggregated {
  const totals = emptyAgg();
  const byFournisseur = new Map<string, Agg>();
  const byFamille = new Map<string, Agg>();
  const byMagasin = new Map<string, Agg>();

  for (const row of rows) {
    const achat = toNum(row.total_achat_ttc);
    const vente = toNum(row.total_vente_ttc);
    const valeur = toNum(row.valeur_stock);
    const tx = toNum(row.nb_tx);

    addInto(totals, achat, vente, valeur, tx);
    addInto(
      getOrInit(byFournisseur, row.fournisseur_id),
      achat,
      vente,
      valeur,
      tx,
    );
    addInto(getOrInit(byFamille, row.famille_id), achat, vente, valeur, tx);
    addInto(getOrInit(byMagasin, row.magasin_id), achat, vente, valeur, tx);
  }

  return { totals, byFournisseur, byFamille, byMagasin };
}

interface NameMaps {
  fournisseur: Map<string, string>;
  famille: Map<string, string>;
  magasin: Map<string, string>;
}

async function loadNameMaps(): Promise<NameMaps> {
  const [fournisseurs, familles, magasins] = await Promise.all([
    prisma.fournisseurs.findMany({ select: { id: true, nom: true } }),
    prisma.familles.findMany({ select: { id: true, nom: true } }),
    prisma.magasins.findMany({ select: { id: true, nom: true } }),
  ]);
  return {
    fournisseur: new Map(fournisseurs.map((f) => [f.id, f.nom])),
    famille: new Map(familles.map((f) => [f.id, f.nom])),
    magasin: new Map(magasins.map((f) => [f.id, f.nom])),
  };
}

export interface FournisseurBreakdown {
  fournisseurId: string;
  fournisseurNom: string;
  totalAchat: number;
  totalVente: number;
  marge: number;
  nbTx: number;
  /** % of this supplier's achat relative to the single top supplier's achat (not of the overall sum) — mirrors the original. */
  pctAchatDuTop: number | null;
}

export interface FamilleBreakdown {
  familleId: string;
  familleNom: string;
  totalAchat: number;
  totalVente: number;
  marge: number;
  totalValeur: number;
  nbTx: number;
}

export interface MagasinBreakdown {
  magasinId: string;
  magasinNom: string;
  totalAchat: number;
  totalVente: number;
  marge: number;
  totalValeur: number;
  nbTx: number;
}

function buildFournisseurBreakdown(
  agg: Aggregated,
  names: NameMaps,
): FournisseurBreakdown[] {
  const rows = [...agg.byFournisseur.entries()]
    .map(([id, v]) => ({
      fournisseurId: id,
      fournisseurNom: names.fournisseur.get(id) ?? id,
      totalAchat: round2(v.totalAchat),
      totalVente: round2(v.totalVente),
      marge: round2(v.totalVente - v.totalAchat),
      nbTx: v.nbTx,
    }))
    .sort((a, b) => b.totalAchat - a.totalAchat);

  const topAchat = rows[0]?.totalAchat ?? 0;
  return rows.map((r) => ({
    ...r,
    pctAchatDuTop:
      topAchat > 0 ? round2((r.totalAchat * 100) / topAchat) : null,
  }));
}

function buildFamilleBreakdown(
  agg: Aggregated,
  names: NameMaps,
): FamilleBreakdown[] {
  return [...agg.byFamille.entries()]
    .map(([id, v]) => ({
      familleId: id,
      familleNom: names.famille.get(id) ?? id,
      totalAchat: round2(v.totalAchat),
      totalVente: round2(v.totalVente),
      marge: round2(v.totalVente - v.totalAchat),
      totalValeur: round2(v.totalValeur),
      nbTx: v.nbTx,
    }))
    .sort((a, b) => b.totalVente - a.totalVente);
}

function buildMagasinBreakdown(
  agg: Aggregated,
  names: NameMaps,
): MagasinBreakdown[] {
  return [...agg.byMagasin.entries()]
    .map(([id, v]) => ({
      magasinId: id,
      magasinNom: names.magasin.get(id) ?? id,
      totalAchat: round2(v.totalAchat),
      totalVente: round2(v.totalVente),
      marge: round2(v.totalVente - v.totalAchat),
      totalValeur: round2(v.totalValeur),
      nbTx: v.nbTx,
    }))
    .sort((a, b) => b.totalVente - a.totalVente);
}

export interface DashboardResponse {
  year: number;
  month: number;
  previousPeriod: {
    year: number;
    month: number;
    totalAchat: number;
    totalVente: number;
    totalValeur: number;
    marge: number;
  } | null;
  totals: {
    totalAchat: number;
    totalVente: number;
    marge: number;
    tauxMarge: number | null;
    totalValeur: number;
    nbTx: number;
  };
  parFournisseur: FournisseurBreakdown[];
  parFamille: FamilleBreakdown[];
  parMagasin: MagasinBreakdown[];
  topFamillesParVente: Array<{
    familleId: string;
    familleNom: string;
    totalVente: number;
  }>;
  topFamillesParValeur: Array<{
    familleId: string;
    familleNom: string;
    totalValeur: number;
  }>;
}

export async function getDashboard(
  year: number,
  month: number,
  scope: AnalyticsScope = {},
): Promise<DashboardResponse> {
  assertNotFuturePeriod(year, month);

  const [rows, names] = await Promise.all([
    fetchKpiLines(year, month, scope),
    loadNameMaps(),
  ]);
  const agg = aggregateRows(rows);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const previous =
    previousYear >= 2000
      ? aggregateRows(await fetchKpiLines(previousYear, previousMonth, scope))
          .totals
      : null;

  const marge = round2(agg.totals.totalVente - agg.totals.totalAchat);
  const tauxMarge =
    agg.totals.totalVente === 0
      ? null
      : round2((marge * 100) / agg.totals.totalVente);

  const parFamille = buildFamilleBreakdown(agg, names);

  const topFamillesParVente = [...parFamille]
    .sort((a, b) => b.totalVente - a.totalVente)
    .slice(0, 5)
    .map((f) => ({
      familleId: f.familleId,
      familleNom: f.familleNom,
      totalVente: f.totalVente,
    }));
  const topFamillesParValeur = [...parFamille]
    .sort((a, b) => b.totalValeur - a.totalValeur)
    .slice(0, 5)
    .map((f) => ({
      familleId: f.familleId,
      familleNom: f.familleNom,
      totalValeur: f.totalValeur,
    }));

  return {
    year,
    month,
    previousPeriod: previous
      ? {
          year: previousYear,
          month: previousMonth,
          totalAchat: round2(previous.totalAchat),
          totalVente: round2(previous.totalVente),
          totalValeur: round2(previous.totalValeur),
          marge: round2(previous.totalVente - previous.totalAchat),
        }
      : null,
    totals: {
      totalAchat: round2(agg.totals.totalAchat),
      totalVente: round2(agg.totals.totalVente),
      marge,
      tauxMarge,
      totalValeur: round2(agg.totals.totalValeur),
      nbTx: agg.totals.nbTx,
    },
    parFournisseur: buildFournisseurBreakdown(agg, names),
    parFamille,
    parMagasin: buildMagasinBreakdown(agg, names),
    topFamillesParVente,
    topFamillesParValeur,
  };
}

export interface AnnualReportResponse {
  year: number;
  upToMonth: number;
  label: string;
  evolution: Array<{
    month: number;
    monthLabel: string;
    totalAchat: number;
    totalVente: number;
    nbTx: number;
  }>;
  cumulAchat: number;
  cumulVente: number;
  cumulMarge: number;
  cumulNbTx: number;
  /** Stock value at the end of the period — from get_kpi_lines_for_month(year, upToMonth), not summed across months. */
  cumValeur: number;
  topFournisseurs: FournisseurBreakdown[];
  topFamilles: FamilleBreakdown[];
  topMagasins: MagasinBreakdown[];
}

/**
 * Direct month-by-month aggregation straight off bl_achat_lignes/vente_lignes
 * (bypassing the monthly snapshot entirely) for the `evolution` array — this is
 * a deliberate second code path in the original, kept separate on purpose.
 */
async function monthDirectTotals(
  year: number,
  month: number,
): Promise<{ totalAchat: number; totalVente: number; nbTx: number }> {
  const [achatResult, venteResult] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(bal.prix_achat_total_ttc), 0) AS achat, COUNT(*) AS cnt
       FROM bl_achat_lignes bal
       JOIN bl_achats bl ON bl.id = bal.bl_achat_id
       WHERE bal.deleted_at IS NULL AND bl.deleted_at IS NULL
         AND EXTRACT(YEAR FROM bl.transaction_date) = $1
         AND EXTRACT(MONTH FROM bl.transaction_date) = $2`,
      [year, month],
    ),
    pool.query(
      `SELECT COALESCE(SUM(vl.prix_vente_total_ttc), 0) AS vente, COUNT(*) AS cnt
       FROM vente_lignes vl
       JOIN ventes v ON v.id = vl.vente_id
       WHERE EXTRACT(YEAR FROM v.vente_date) = $1
         AND EXTRACT(MONTH FROM v.vente_date) = $2`,
      [year, month],
    ),
  ]);

  const achatRow = achatResult.rows[0] as
    | { achat: string; cnt: string }
    | undefined;
  const venteRow = venteResult.rows[0] as
    | { vente: string; cnt: string }
    | undefined;

  return {
    totalAchat: toNum(achatRow?.achat),
    totalVente: toNum(venteRow?.vente),
    nbTx: toNum(achatRow?.cnt) + toNum(venteRow?.cnt),
  };
}

export async function getAnnualReport(
  year: number,
): Promise<AnnualReportResponse> {
  assertNotFutureYear(year);
  const { year: curYear, month: curMonth } = currentYearMonth();
  const upToMonth = year === curYear ? curMonth : 12;

  const evolution: AnnualReportResponse["evolution"] = [];
  for (let month = 1; month <= upToMonth; month++) {
    const { totalAchat, totalVente, nbTx } = await monthDirectTotals(
      year,
      month,
    );
    evolution.push({
      month,
      monthLabel: frMonthLabel(year, month),
      totalAchat: round2(totalAchat),
      totalVente: round2(totalVente),
      nbTx,
    });
  }

  const cumulAchat = round2(evolution.reduce((s, e) => s + e.totalAchat, 0));
  const cumulVente = round2(evolution.reduce((s, e) => s + e.totalVente, 0));
  const cumulNbTx = evolution.reduce((s, e) => s + e.nbTx, 0);
  const cumulMarge = round2(cumulVente - cumulAchat);

  // Per-dimension breakdowns and cumValeur: end-of-period snapshot state only
  // (get_kpi_lines_for_month(year, upToMonth)), not a sum across all months —
  // intentional per the original, not reconciled with the evolution totals above.
  const [rows, names] = await Promise.all([
    fetchKpiLines(year, upToMonth),
    loadNameMaps(),
  ]);
  const agg = aggregateRows(rows);
  const cumValeur = round2(agg.totals.totalValeur);

  const topFournisseurs = buildFournisseurBreakdown(agg, names)
    .slice()
    .sort((a, b) => b.totalVente - a.totalVente)
    .slice(0, 2);
  const topFamilles = buildFamilleBreakdown(agg, names).slice(0, 2);
  const topMagasins = buildMagasinBreakdown(agg, names).slice(0, 2);

  return {
    year,
    upToMonth,
    label: `Cumulé de Janvier à ${frMonthLabel(year, upToMonth)} ${year}`,
    evolution,
    cumulAchat,
    cumulVente,
    cumulMarge,
    cumulNbTx,
    cumValeur,
    topFournisseurs,
    topFamilles,
    topMagasins,
  };
}

const entityTypeByDimension: Record<DrilldownDimension, string> = {
  familles: "FAMILLE",
  fournisseurs: "FOURNISSEUR",
  magasins: "MAGASIN",
};

async function findDimensionEntity(
  dimension: DrilldownDimension,
  id: string,
): Promise<{ id: string; nom: string } | null> {
  switch (dimension) {
    case "familles":
      return prisma.familles.findFirst({
        where: { id, deleted_at: null },
        select: { id: true, nom: true },
      });
    case "fournisseurs":
      return prisma.fournisseurs.findFirst({
        where: { id, deleted_at: null },
        select: { id: true, nom: true },
      });
    case "magasins":
      return prisma.magasins.findFirst({
        where: { id, deleted_at: null },
        select: { id: true, nom: true },
      });
  }
}

function matchesDimension(
  row: KpiRow,
  dimension: DrilldownDimension,
  id: string,
): boolean {
  switch (dimension) {
    case "familles":
      return row.famille_id === id;
    case "fournisseurs":
      return row.fournisseur_id === id;
    case "magasins":
      return row.magasin_id === id;
  }
}

export interface DrilldownItem {
  produitId: string;
  produitReference: string;
  produitDesignation: string;
  magasinId: string;
  magasinNom: string;
  fournisseurId: string;
  fournisseurNom: string;
  familleId: string;
  familleNom: string;
  qteAchetee: number;
  qteVendue: number;
  totalAchat: number;
  totalVente: number;
  qteStock: number;
  cmupCumule: number | null;
  totalValeur: number;
  qteDeficit: number;
  nbTx: number;
}

export interface DrilldownResponse {
  dimension: DrilldownDimension;
  id: string;
  nom: string;
  year: number;
  month: number;
  items: DrilldownItem[];
  totals: {
    totalAchat: number;
    totalVente: number;
    totalValeur: number;
    qteDeficit: number;
    nbTx: number;
    /** Only present for the fournisseurs dimension — intentional, store/famille totals omit marge. */
    marge?: number;
  };
}

export async function getDrilldown(
  dimension: DrilldownDimension,
  id: string,
  year: number,
  month: number,
  scope: AnalyticsScope = {},
): Promise<DrilldownResponse> {
  assertNotFuturePeriod(year, month);

  const entity = await findDimensionEntity(dimension, id);
  if (!entity) {
    throw new ResourceNotFoundException(entityTypeByDimension[dimension], id);
  }

  const allRows = await fetchKpiLines(year, month, scope);
  const rows = allRows.filter((row) => matchesDimension(row, dimension, id));

  const produitIds = [...new Set(rows.map((r) => r.produit_id))];
  const magasinIds = [...new Set(rows.map((r) => r.magasin_id))];
  const fournisseurIds = [...new Set(rows.map((r) => r.fournisseur_id))];
  const familleIds = [...new Set(rows.map((r) => r.famille_id))];

  const [produits, magasins, fournisseurs, familles] = await Promise.all([
    prisma.produits.findMany({
      where: { id: { in: produitIds } },
      select: { id: true, reference: true, designation: true },
    }),
    prisma.magasins.findMany({
      where: { id: { in: magasinIds } },
      select: { id: true, nom: true },
    }),
    prisma.fournisseurs.findMany({
      where: { id: { in: fournisseurIds } },
      select: { id: true, nom: true },
    }),
    prisma.familles.findMany({
      where: { id: { in: familleIds } },
      select: { id: true, nom: true },
    }),
  ]);
  const produitMap = new Map(produits.map((p) => [p.id, p]));
  const magasinMap = new Map(magasins.map((p) => [p.id, p.nom]));
  const fournisseurMap = new Map(fournisseurs.map((p) => [p.id, p.nom]));
  const familleMap = new Map(familles.map((p) => [p.id, p.nom]));

  const items: DrilldownItem[] = rows.map((r) => {
    const produit = produitMap.get(r.produit_id);
    return {
      produitId: r.produit_id,
      produitReference: produit?.reference ?? r.produit_id,
      produitDesignation: produit?.designation ?? "",
      magasinId: r.magasin_id,
      magasinNom: magasinMap.get(r.magasin_id) ?? r.magasin_id,
      fournisseurId: r.fournisseur_id,
      fournisseurNom: fournisseurMap.get(r.fournisseur_id) ?? r.fournisseur_id,
      familleId: r.famille_id,
      familleNom: familleMap.get(r.famille_id) ?? r.famille_id,
      qteAchetee: toNum(r.qte_achetee),
      qteVendue: toNum(r.qte_vendue),
      totalAchat: toNum(r.total_achat_ttc),
      totalVente: toNum(r.total_vente_ttc),
      qteStock: toNum(r.qte_stock),
      cmupCumule: r.cmup_cumule == null ? null : Number(r.cmup_cumule),
      totalValeur: toNum(r.valeur_stock),
      qteDeficit: toNum(r.qte_deficit),
      nbTx: toNum(r.nb_tx),
    };
  });

  const totalAchat = round2(items.reduce((s, i) => s + i.totalAchat, 0));
  const totalVente = round2(items.reduce((s, i) => s + i.totalVente, 0));
  const totalValeur = round2(items.reduce((s, i) => s + i.totalValeur, 0));
  const qteDeficit = round2(items.reduce((s, i) => s + i.qteDeficit, 0));
  const nbTx = items.reduce((s, i) => s + i.nbTx, 0);

  const totals: DrilldownResponse["totals"] = {
    totalAchat,
    totalVente,
    totalValeur,
    qteDeficit,
    nbTx,
  };
  if (dimension === "fournisseurs") {
    totals.marge = round2(totalVente - totalAchat);
  }

  return {
    dimension,
    id,
    nom: entity.nom,
    year,
    month,
    items,
    totals,
  };
}
