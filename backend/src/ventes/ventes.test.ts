import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, round3, Prisma } from "../db.js";
import type { CurrentUser } from "../common/current-user.js";
import { createBlAchatTx } from "../bl-achats/service.js";
import { createVenteTx, updateVenteTx, deleteVenteTx } from "./service.js";
import { RollbackForTest, runAndRollback } from "./test-helpers.js";

const TODAY = new Date().toISOString().slice(0, 10);
const JAN = "2026-01-05";
const FEB = "2026-02-10";

let actor: CurrentUser;
let magasinId: string;
let fournisseurId: string;
let familleId: string;
const ctx = { ipAddress: "127.0.0.1", traceId: "test-trace" };

beforeAll(async () => {
  const user = await prisma.users.findFirstOrThrow({ where: { is_active: true, deleted_at: null } });
  actor = { id: user.id, email: user.email, role: user.role as CurrentUser["role"] };

  const magasin = await prisma.magasins.findFirstOrThrow({
    where: { is_active: true, deleted_at: null },
  });
  magasinId = magasin.id;

  const fournisseur = await prisma.fournisseurs.findFirstOrThrow({
    where: { is_active: true, deleted_at: null },
  });
  fournisseurId = fournisseur.id;

  const famille = await prisma.familles.findFirstOrThrow({
    where: { is_active: true, deleted_at: null },
  });
  familleId = famille.id;
});

/** Creates a throwaway, test-scoped produit so draw tests never collide with real production stock. */
async function makeTestProduit(tx: Prisma.TransactionClient) {
  return tx.produits.create({
    data: {
      reference: `TEST-${randomUUID()}`,
      designation: "Produit de test",
      famille_id: familleId,
      is_active: true,
      created_by: actor.id,
    },
  });
}

async function makeBlLigne(
  tx: Prisma.TransactionClient,
  produitId: string,
  transactionDate: string,
  qte: number,
  prixNetHt = 100,
) {
  const bl = await createBlAchatTx(
    tx,
    {
      transactionDate,
      blNumero: `BL-${randomUUID().slice(0, 8)}`,
      magasinId,
      fournisseurId,
      lignes: [{ produitId, qteAchetee: qte, prixAchatNetHt: prixNetHt, tauxTva: 19 }],
    },
    actor,
    ctx,
  );
  return bl.lignes[0]!;
}

describe("createVenteTx — draw down", () => {
  it("fully covers a sale from a single BL line", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);
        await makeBlLigne(tx, produit.id, JAN, 20);

        const result = await createVenteTx(
          tx,
          { venteDate: TODAY, magasinId, lignes: [{ produitId: produit.id, qteVendue: 5, prixVenteTtc: 150 }] },
          actor,
          ctx,
        );

        expect(result.lignes).toHaveLength(1);
        const line = result.lignes[0]!;
        expect(line.sourceType).toBe("BL_LIGNE");
        expect(line.qteVendue).toBe(5);
        expect(line.depassementStock).toBe(false);
        expect(line.qteNonCouverte).toBe(0);
        expect(line.prixVenteTotalTtc).toBeCloseTo(round3(150 * 5).toNumber(), 3);

        const sourceLines = await tx.bl_achat_lignes.findMany({ where: { produit_id: produit.id } });
        expect(sourceLines).toHaveLength(1);
        expect(Number(sourceLines[0]!.qte_restante)).toBe(15);

        throw new RollbackForTest();
      }),
    );
  });

  it("splits a sale across two BL lines, oldest first", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);
        const janLigne = await makeBlLigne(tx, produit.id, JAN, 3);
        const febLigne = await makeBlLigne(tx, produit.id, FEB, 10);

        const result = await createVenteTx(
          tx,
          { venteDate: TODAY, magasinId, lignes: [{ produitId: produit.id, qteVendue: 8, prixVenteTtc: 50 }] },
          actor,
          ctx,
        );

        expect(result.lignes).toHaveLength(2);
        expect(result.lignes[0]!.sourceType).toBe("BL_LIGNE");
        expect(result.lignes[1]!.sourceType).toBe("BL_LIGNE");
        // Oldest (January) BL line must be drawn from first, and fully exhausted (only 3 available).
        expect(result.lignes[0]!.qteVendue).toBe(3);
        expect(result.lignes[1]!.qteVendue).toBe(5);

        const janRow = await tx.bl_achat_lignes.findUniqueOrThrow({ where: { id: janLigne.id } });
        const febRow = await tx.bl_achat_lignes.findUniqueOrThrow({ where: { id: febLigne.id } });
        expect(Number(janRow.qte_restante)).toBe(0);
        expect(Number(febRow.qte_restante)).toBe(5);

        throw new RollbackForTest();
      }),
    );
  });

  it("falls back to the legacy stock lot, fully covered, once BL lines are exhausted", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);
        await tx.stock_legacy_lots.create({
          data: {
            produit_id: produit.id,
            magasin_id: magasinId,
            qte_disponible: round3(50),
            cout_unitaire: round3(0),
          },
        });

        const result = await createVenteTx(
          tx,
          { venteDate: TODAY, magasinId, lignes: [{ produitId: produit.id, qteVendue: 20, prixVenteTtc: 30 }] },
          actor,
          ctx,
        );

        expect(result.lignes).toHaveLength(1);
        const line = result.lignes[0]!;
        expect(line.sourceType).toBe("STOCK_LEGACY");
        expect(line.qteVendue).toBe(20);
        expect(line.depassementStock).toBe(false);
        expect(line.qteNonCouverte).toBe(0);

        const lot = await tx.stock_legacy_lots.findUniqueOrThrow({
          where: { produit_id_magasin_id: { produit_id: produit.id, magasin_id: magasinId } },
        });
        expect(Number(lot.qte_disponible)).toBe(30);

        throw new RollbackForTest();
      }),
    );
  });

  it("flags an oversell on the trailing legacy-lot line without clamping qte_vendue", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);
        await tx.stock_legacy_lots.create({
          data: {
            produit_id: produit.id,
            magasin_id: magasinId,
            qte_disponible: round3(5),
            cout_unitaire: round3(0),
          },
        });

        const result = await createVenteTx(
          tx,
          { venteDate: TODAY, magasinId, lignes: [{ produitId: produit.id, qteVendue: 20, prixVenteTtc: 30 }] },
          actor,
          ctx,
        );

        expect(result.lignes).toHaveLength(1);
        const line = result.lignes[0]!;
        expect(line.sourceType).toBe("STOCK_LEGACY");
        expect(line.qteVendue).toBe(20); // full requested quantity, never clamped
        expect(line.depassementStock).toBe(true);
        expect(line.qteNonCouverte).toBe(15);
        expect(line.prixVenteTotalTtc).toBeCloseTo(round3(30 * 20).toNumber(), 3);
        expect(result.hasDepassement).toBe(true);

        const lot = await tx.stock_legacy_lots.findUniqueOrThrow({
          where: { produit_id_magasin_id: { produit_id: produit.id, magasin_id: magasinId } },
        });
        expect(Number(lot.qte_disponible)).toBe(0);

        const auditRow = await tx.audit_logs.findFirst({
          where: { entity_type: "VENTE", entity_id: result.id },
        });
        expect(auditRow?.summary).toContain("dépassement de stock signalé");

        throw new RollbackForTest();
      }),
    );
  });

  it("never draws across stores (scoped strictly to magasinId)", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);
        const otherMagasin = await prisma.magasins.findFirstOrThrow({
          where: { is_active: true, deleted_at: null, id: { not: magasinId } },
        });
        await makeBlLigne(tx, produit.id, JAN, 50);

        // Sell from a DIFFERENT store: the BL line above (in `magasinId`'s store) must not be touched.
        const result = await createVenteTx(
          tx,
          {
            venteDate: TODAY,
            magasinId: otherMagasin.id,
            lignes: [{ produitId: produit.id, qteVendue: 5, prixVenteTtc: 10 }],
          },
          actor,
          ctx,
        );

        expect(result.lignes).toHaveLength(1);
        expect(result.lignes[0]!.sourceType).toBe("STOCK_LEGACY");

        const sourceLines = await tx.bl_achat_lignes.findMany({ where: { produit_id: produit.id } });
        expect(Number(sourceLines[0]!.qte_restante)).toBe(50);

        throw new RollbackForTest();
      }),
    );
  });
});

describe("updateVenteTx — reverse then redraw", () => {
  it("fully reverses the old draw before redrawing against the new lines", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);
        const ligne = await makeBlLigne(tx, produit.id, JAN, 20);

        const created = await createVenteTx(
          tx,
          { venteDate: TODAY, magasinId, lignes: [{ produitId: produit.id, qteVendue: 5, prixVenteTtc: 100 }] },
          actor,
          ctx,
        );

        const afterCreate = await tx.bl_achat_lignes.findUniqueOrThrow({ where: { id: ligne.id } });
        expect(Number(afterCreate.qte_restante)).toBe(15);

        const updated = await updateVenteTx(
          tx,
          created.id,
          { venteDate: TODAY, magasinId, lignes: [{ produitId: produit.id, qteVendue: 8, prixVenteTtc: 100 }] },
          actor,
          ctx,
        );

        expect(updated.lignes).toHaveLength(1);
        expect(updated.lignes[0]!.qteVendue).toBe(8);

        // 20 (original) - 8 (redrawn) = 12, proving the full reverse of the old 5 happened
        // before the new line (8) was drawn, not simply 15 - 8 = 7.
        const afterUpdate = await tx.bl_achat_lignes.findUniqueOrThrow({ where: { id: ligne.id } });
        expect(Number(afterUpdate.qte_restante)).toBe(12);

        // Old vente_lignes row must be gone (hard-replaced), not merely a second row.
        const remainingLines = await tx.vente_lignes.findMany({ where: { vente_id: created.id } });
        expect(remainingLines).toHaveLength(1);
        expect(remainingLines[0]!.id).not.toBe(created.lignes[0]!.id);

        throw new RollbackForTest();
      }),
    );
  });

  it("only reverses the actually-deducted quantity when the old line was partially uncovered", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);
        await tx.stock_legacy_lots.create({
          data: {
            produit_id: produit.id,
            magasin_id: magasinId,
            qte_disponible: round3(5),
            cout_unitaire: round3(0),
          },
        });

        // qteVendue 20, only 5 actually deducted (depassement), qte_non_couverte 15.
        const created = await createVenteTx(
          tx,
          { venteDate: TODAY, magasinId, lignes: [{ produitId: produit.id, qteVendue: 20, prixVenteTtc: 10 }] },
          actor,
          ctx,
        );
        expect(created.lignes[0]!.qteNonCouverte).toBe(15);

        // Replace with an empty-ish small sale; reversing must restore only 5 (= 20 - 15), not 20.
        await updateVenteTx(
          tx,
          created.id,
          { venteDate: TODAY, magasinId, lignes: [{ produitId: produit.id, qteVendue: 1, prixVenteTtc: 10 }] },
          actor,
          ctx,
        );

        const lot = await tx.stock_legacy_lots.findUniqueOrThrow({
          where: { produit_id_magasin_id: { produit_id: produit.id, magasin_id: magasinId } },
        });
        // Reverse restored 5 (back to 5), then redraw of qty 1 deducted 1 -> 4 remaining.
        expect(Number(lot.qte_disponible)).toBe(4);

        throw new RollbackForTest();
      }),
    );
  });
});

describe("deleteVenteTx — reverse then remove", () => {
  it("reverses the draw and removes the header (cascade removes the lines)", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);
        const ligne = await makeBlLigne(tx, produit.id, JAN, 20);

        const created = await createVenteTx(
          tx,
          { venteDate: TODAY, magasinId, lignes: [{ produitId: produit.id, qteVendue: 5, prixVenteTtc: 100 }] },
          actor,
          ctx,
        );

        await deleteVenteTx(tx, created.id, actor, ctx);

        const sourceRow = await tx.bl_achat_lignes.findUniqueOrThrow({ where: { id: ligne.id } });
        expect(Number(sourceRow.qte_restante)).toBe(20);

        const venteRow = await tx.ventes.findUnique({ where: { id: created.id } });
        expect(venteRow).toBeNull();

        const lineRows = await tx.vente_lignes.findMany({ where: { vente_id: created.id } });
        expect(lineRows).toHaveLength(0);

        throw new RollbackForTest();
      }),
    );
  });
});
