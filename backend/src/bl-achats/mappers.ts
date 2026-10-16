import type { Prisma } from "@prisma/client";
import { formatDateOnly } from "./date-utils.js";

type LigneWithProduit = Prisma.bl_achat_lignesGetPayload<{ include: { produits: true } }>;
type BlAchatFull = Prisma.bl_achatsGetPayload<{
  include: {
    magasins: true;
    fournisseurs: true;
    bl_achat_lignes: { include: { produits: true } };
  };
}>;

export function toBlAchatLigneResponse(l: LigneWithProduit) {
  return {
    id: l.id,
    produitId: l.produit_id,
    produitReference: l.produits.reference,
    produitDesignation: l.produits.designation,
    qteAchetee: Number(l.qte_achetee),
    qteRestante: Number(l.qte_restante),
    prixAchatNetHt: Number(l.prix_achat_net_ht),
    tauxTva: l.taux_tva,
    prixAchatTtc: Number(l.prix_achat_ttc),
    prixAchatTotalTtc: Number(l.prix_achat_total_ttc),
  };
}

export function toBlAchatResponse(bl: BlAchatFull) {
  return {
    id: bl.id,
    transactionDate: formatDateOnly(bl.transaction_date),
    blNumero: bl.bl_numero,
    magasinId: bl.magasin_id,
    magasinNom: bl.magasins.nom,
    fournisseurId: bl.fournisseur_id,
    fournisseurNom: bl.fournisseurs.nom,
    lignes: bl.bl_achat_lignes
      .filter((l) => l.deleted_at === null)
      .map(toBlAchatLigneResponse),
  };
}

export type BlAchatResponse = ReturnType<typeof toBlAchatResponse>;
