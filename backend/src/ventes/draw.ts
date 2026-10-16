/**
 * The stock draw-down / reverse algorithm. This is the highest-risk logic in the
 * whole domain: get the sequencing wrong and sale quantities silently stop
 * reconciling against purchase lines and legacy stock.
 */
import { Prisma, round3 } from "../db.js";

type Tx = Prisma.TransactionClient;

export interface DrawInput {
  produitId: string;
  /** Requested quantity, as a Decimal already rounded to 3dp. */
  qteVendue: Prisma.Decimal;
  /** Requested unit price (TTC), already rounded to 3dp. */
  prixVenteTtc: Prisma.Decimal;
}

/** A vente_lignes row ready to persist (vente_id/id/timestamps added by the caller). */
export interface DrawnLigne {
  produit_id: string;
  source_type: "BL_LIGNE" | "STOCK_LEGACY";
  bl_achat_ligne_id: string | null;
  stock_legacy_lot_id: string | null;
  qte_vendue: Prisma.Decimal;
  prix_vente_ttc: Prisma.Decimal;
  prix_vente_total_ttc: Prisma.Decimal;
  depassement_stock: boolean;
  qte_non_couverte: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);

/**
 * Draws one requested line down against BL purchase lines (oldest `transaction_date`,
 * then oldest `created_at`, first; scoped strictly to `magasinId` — no cross-store
 * draw), then — only if any quantity remains uncovered — against the product's
 * legacy stock lot for that store. Mutates `bl_achat_lignes.qte_restante` and
 * `stock_legacy_lots.qte_disponible` as it goes, inside the caller's transaction.
 *
 * Returns the vente_lignes rows to persist: zero or more "BL_LIGNE" rows (one per BL
 * line drawn from, in BL chronological order — BL-sourced rows can never be
 * oversold), followed by at most one trailing "STOCK_LEGACY" row whenever any
 * quantity reaches that fallback (present even when fully covered there;
 * `depassement_stock` only distinguishes the oversell case).
 */
export async function drawLine(tx: Tx, magasinId: string, input: DrawInput): Promise<DrawnLigne[]> {
  let remaining = input.qteVendue;
  const rows: DrawnLigne[] = [];

  const sources = await tx.bl_achat_lignes.findMany({
    where: {
      produit_id: input.produitId,
      qte_restante: { gt: 0 },
      deleted_at: null,
      bl_achats: { magasin_id: magasinId, deleted_at: null },
    },
    include: { bl_achats: true },
    orderBy: [{ bl_achats: { transaction_date: "asc" } }, { bl_achats: { created_at: "asc" } }],
  });

  for (const source of sources) {
    if (remaining.lte(ZERO)) break;

    const sourceRestante = new Prisma.Decimal(source.qte_restante);
    const drawQty = Prisma.Decimal.min(remaining, sourceRestante);
    if (drawQty.lte(ZERO)) continue;

    await tx.bl_achat_lignes.update({
      where: { id: source.id },
      data: { qte_restante: round3(sourceRestante.minus(drawQty)) },
    });

    rows.push({
      produit_id: input.produitId,
      source_type: "BL_LIGNE",
      bl_achat_ligne_id: source.id,
      stock_legacy_lot_id: null,
      qte_vendue: round3(drawQty),
      prix_vente_ttc: round3(input.prixVenteTtc),
      prix_vente_total_ttc: round3(input.prixVenteTtc.times(drawQty)),
      depassement_stock: false,
      qte_non_couverte: round3(ZERO),
    });

    remaining = round3(remaining.minus(drawQty));
  }

  if (remaining.gt(ZERO)) {
    let lot = await tx.stock_legacy_lots.findUnique({
      where: { produit_id_magasin_id: { produit_id: input.produitId, magasin_id: magasinId } },
    });
    if (!lot) {
      lot = await tx.stock_legacy_lots.create({
        data: {
          produit_id: input.produitId,
          magasin_id: magasinId,
          qte_disponible: round3(ZERO),
          cout_unitaire: round3(ZERO),
        },
      });
    }

    const lotQte = new Prisma.Decimal(lot.qte_disponible);
    let deducted = Prisma.Decimal.min(remaining, lotQte);
    if (deducted.lt(ZERO)) deducted = ZERO;

    await tx.stock_legacy_lots.update({
      where: { id: lot.id },
      data: { qte_disponible: round3(lotQte.minus(deducted)) },
    });

    const nonCouverte = round3(remaining.minus(deducted));

    rows.push({
      produit_id: input.produitId,
      source_type: "STOCK_LEGACY",
      bl_achat_ligne_id: null,
      stock_legacy_lot_id: lot.id,
      qte_vendue: round3(remaining),
      prix_vente_ttc: round3(input.prixVenteTtc),
      prix_vente_total_ttc: round3(input.prixVenteTtc.times(remaining)),
      depassement_stock: nonCouverte.gt(ZERO),
      qte_non_couverte: nonCouverte,
    });
  }

  return rows;
}

export interface ReversibleLigne {
  source_type: string;
  qte_vendue: Prisma.Decimal.Value;
  qte_non_couverte: Prisma.Decimal.Value;
  bl_achat_ligne_id: string | null;
  stock_legacy_lot_id: string | null;
}

/**
 * Reverses one persisted vente_ligne's effect on its source (BL line or legacy lot),
 * restoring only the quantity that was actually deducted (`qte_vendue - qte_non_couverte`
 * — never the full requested quantity when the line was partially uncovered).
 * Uses `updateMany` + `where: { id }` rather than `update` so it tolerantly no-ops
 * if the source row is somehow gone, instead of throwing.
 */
export async function reverseVenteLigne(tx: Tx, ligne: ReversibleLigne): Promise<void> {
  const qteVendue = new Prisma.Decimal(ligne.qte_vendue);
  const qteNonCouverte = new Prisma.Decimal(ligne.qte_non_couverte);
  const deducted = qteVendue.minus(qteNonCouverte);
  if (deducted.lte(ZERO)) return;

  if (ligne.source_type === "BL_LIGNE" && ligne.bl_achat_ligne_id) {
    await tx.bl_achat_lignes.updateMany({
      where: { id: ligne.bl_achat_ligne_id },
      data: { qte_restante: { increment: round3(deducted) } },
    });
  } else if (ligne.source_type === "STOCK_LEGACY" && ligne.stock_legacy_lot_id) {
    await tx.stock_legacy_lots.updateMany({
      where: { id: ligne.stock_legacy_lot_id },
      data: { qte_disponible: { increment: round3(deducted) } },
    });
  }
}
