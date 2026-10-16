import type { Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime, round3 } from "../db.js";
import { formatDateOnly } from "./date-utils.js";

type LigneWithProduit = Prisma.vente_lignesGetPayload<{ include: { produits: true } }>;
type VenteFull = Prisma.ventesGetPayload<{
  include: { magasins: true; vente_lignes: { include: { produits: true } } };
}>;

export function toVenteLigneResponse(l: LigneWithProduit) {
  return {
    id: l.id,
    produitId: l.produit_id,
    produitReference: l.produits.reference,
    produitDesignation: l.produits.designation,
    sourceType: l.source_type as "BL_LIGNE" | "STOCK_LEGACY",
    qteVendue: Number(l.qte_vendue),
    prixVenteTtc: Number(l.prix_vente_ttc),
    prixVenteTotalTtc: Number(l.prix_vente_total_ttc),
    depassementStock: l.depassement_stock,
    qteNonCouverte: Number(l.qte_non_couverte),
  };
}

export function toVenteResponse(v: VenteFull) {
  const lignes = v.vente_lignes.map(toVenteLigneResponse);
  const totalTtcDecimal = v.vente_lignes.reduce(
    (acc, l) => acc.plus(l.prix_vente_total_ttc),
    new PrismaRuntime.Decimal(0),
  );
  return {
    id: v.id,
    venteDate: formatDateOnly(v.vente_date),
    magasinId: v.magasin_id,
    magasinNom: v.magasins.nom,
    lignes,
    totalTtc: round3(totalTtcDecimal).toNumber(),
    hasDepassement: lignes.some((l) => l.depassementStock),
  };
}

export type VenteResponse = ReturnType<typeof toVenteResponse>;
