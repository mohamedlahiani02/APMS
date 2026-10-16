import { buildBlAchatWhere } from "../bl-achats/service.js";
import { buildVenteWhere as buildVenteWhereFromList } from "../ventes/service.js";
import ExcelJS from "exceljs";
import { prisma, Prisma } from "../db.js";
import type { ExportQuery } from "./schemas.js";

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function exportFilters(query: ExportQuery) {
  return {
    ...query,
    dateFrom: query.dateFrom?.toISOString().slice(0, 10),
    dateTo: query.dateTo?.toISOString().slice(0, 10),
  };
}
function buildBlWhere(query: ExportQuery) {
  return buildBlAchatWhere(exportFilters(query));
}
function buildVenteWhere(query: ExportQuery) {
  return buildVenteWhereFromList(exportFilters(query));
}

/**
 * Combined "BL Achats" + "Ventes" workbook. Replaces the original's buggy
 * per-resource export endpoints (Known Issue #4: untyped-null JPQL filters
 * caused a Postgres "could not determine data type of parameter" error) —
 * here the `where` clauses are built directly in TypeScript/Prisma, simply
 * omitting absent filters, so that bug class doesn't apply.
 *
 * Each tab reads its own table independently (bl_achats/bl_achat_lignes,
 * ventes/vente_lignes) with the same filters applied to both — never
 * transactions_legacy, which is frozen and would show stale data.
 */
export async function buildTransactionsWorkbook(
  query: ExportQuery,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const blSheet = workbook.addWorksheet("BL Achats");
  blSheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Numéro BL", key: "blNumero", width: 16 },
    { header: "Magasin", key: "magasin", width: 22 },
    { header: "Fournisseur", key: "fournisseur", width: 22 },
    { header: "Produit", key: "produit", width: 32 },
    { header: "Quantité achetée", key: "qteAchetee", width: 16 },
    { header: "Prix net HT", key: "prixNetHt", width: 14 },
    { header: "TVA", key: "tva", width: 10 },
    { header: "Prix TTC", key: "prixTtc", width: 14 },
    { header: "Total TTC", key: "totalTtc", width: 14 },
  ];

  const blAchats = await prisma.bl_achats.findMany({
    where: buildBlWhere(query),
    include: {
      magasins: true,
      fournisseurs: true,
      bl_achat_lignes: {
        where: { deleted_at: null },
        include: { produits: true },
      },
    },
    orderBy: { transaction_date: "asc" },
  });

  for (const bl of blAchats) {
    for (const ligne of bl.bl_achat_lignes) {
      blSheet.addRow({
        date: toDateOnly(bl.transaction_date),
        blNumero: bl.bl_numero,
        magasin: bl.magasins.nom,
        fournisseur: bl.fournisseurs.nom,
        produit: `${ligne.produits.reference} - ${ligne.produits.designation}`,
        qteAchetee: Number(ligne.qte_achetee),
        prixNetHt: Number(ligne.prix_achat_net_ht),
        tva: ligne.taux_tva,
        prixTtc: Number(ligne.prix_achat_ttc),
        totalTtc: Number(ligne.prix_achat_total_ttc),
      });
    }
  }

  const venteSheet = workbook.addWorksheet("Ventes");
  venteSheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Magasin", key: "magasin", width: 22 },
    { header: "Produit", key: "produit", width: 32 },
    { header: "Quantité vendue", key: "qteVendue", width: 16 },
    { header: "Prix TTC", key: "prixTtc", width: 14 },
    { header: "Total TTC", key: "totalTtc", width: 14 },
    { header: "Dépassement de stock", key: "depassement", width: 20 },
  ];

  const ventes = await prisma.ventes.findMany({
    where: buildVenteWhere(query),
    include: {
      magasins: true,
      vente_lignes: { include: { produits: true } },
    },
    orderBy: { vente_date: "asc" },
  });

  for (const vente of ventes) {
    for (const ligne of vente.vente_lignes) {
      venteSheet.addRow({
        date: toDateOnly(vente.vente_date),
        magasin: vente.magasins.nom,
        produit: `${ligne.produits.reference} - ${ligne.produits.designation}`,
        qteVendue: Number(ligne.qte_vendue),
        prixTtc: Number(ligne.prix_vente_ttc),
        totalTtc: Number(ligne.prix_vente_total_ttc),
        depassement: ligne.depassement_stock ? "Oui" : "Non",
      });
    }
  }

  if (query.type === "achats") workbook.removeWorksheet(venteSheet.id);
  if (query.type === "ventes") workbook.removeWorksheet(blSheet.id);
  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: "A1",
      to: { row: 1, column: sheet.columnCount },
    };
    sheet.getRow(1).font = { bold: true };
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
