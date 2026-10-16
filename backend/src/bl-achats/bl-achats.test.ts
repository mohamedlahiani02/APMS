import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, round3, Prisma } from "../db.js";
import type { CurrentUser } from "../common/current-user.js";
import { BlAchatHasVentesException } from "../common/errors.js";
import { createVenteTx } from "../ventes/service.js";
import { createBlAchatTx, updateBlAchatTx, deleteBlAchatTx } from "./service.js";
import { RollbackForTest, runAndRollback } from "./test-helpers.js";

const TODAY = new Date().toISOString().slice(0, 10);

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

/** Creates a throwaway, test-scoped produit so draw/line tests never collide with real production stock. */
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

describe("createBlAchatTx", () => {
  it("computes prixAchatTtc / prixAchatTotalTtc per line and seeds qte_restante = qte_achetee", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);

        const result = await createBlAchatTx(
          tx,
          {
            transactionDate: TODAY,
            blNumero: "BL-TEST-0001",
            magasinId,
            fournisseurId,
            lignes: [{ produitId: produit.id, qteAchetee: 10, prixAchatNetHt: 100, tauxTva: 19 }],
          },
          actor,
          ctx,
        );

        const expectedTtc = round3(100 * 1.19).toNumber();
        const expectedTotal = round3(expectedTtc * 10).toNumber();

        expect(result.lignes).toHaveLength(1);
        expect(result.lignes[0]!.prixAchatTtc).toBeCloseTo(expectedTtc, 3);
        expect(result.lignes[0]!.prixAchatTotalTtc).toBeCloseTo(expectedTotal, 3);
        expect(result.lignes[0]!.qteAchetee).toBe(10);
        expect(result.lignes[0]!.qteRestante).toBe(10);

        throw new RollbackForTest();
      }),
    );
  });
});

describe("updateBlAchatTx", () => {
  it("full-replaces lines when none have been drawn from", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produitA = await makeTestProduit(tx);
        const produitB = await makeTestProduit(tx);

        const created = await createBlAchatTx(
          tx,
          {
            transactionDate: TODAY,
            blNumero: "BL-TEST-0002",
            magasinId,
            fournisseurId,
            lignes: [{ produitId: produitA.id, qteAchetee: 5, prixAchatNetHt: 50, tauxTva: 7 }],
          },
          actor,
          ctx,
        );
        const oldLigneId = created.lignes[0]!.id;

        const updated = await updateBlAchatTx(
          tx,
          created.id,
          {
            lignes: [{ produitId: produitB.id, qteAchetee: 3, prixAchatNetHt: 20, tauxTva: 13 }],
          },
          actor,
          ctx,
        );

        expect(updated.lignes).toHaveLength(1);
        expect(updated.lignes[0]!.produitId).toBe(produitB.id);
        expect(updated.lignes[0]!.id).not.toBe(oldLigneId);

        const oldLigneRow = await tx.bl_achat_lignes.findUnique({ where: { id: oldLigneId } });
        expect(oldLigneRow?.deleted_at).not.toBeNull();

        throw new RollbackForTest();
      }),
    );
  });

  it("blocks line replacement (with the 'modifier' message) once a line has been drawn from, and makes no other change first", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);

        const created = await createBlAchatTx(
          tx,
          {
            transactionDate: TODAY,
            blNumero: "BL-TEST-0003",
            magasinId,
            fournisseurId,
            lignes: [{ produitId: produit.id, qteAchetee: 10, prixAchatNetHt: 10, tauxTva: 19 }],
          },
          actor,
          ctx,
        );

        // Simulate a partial draw directly (the update-block check only inspects
        // qte_restante vs qte_achetee, independent of how the draw happened).
        await tx.bl_achat_lignes.update({
          where: { id: created.lignes[0]!.id },
          data: { qte_restante: round3(4) },
        });

        let thrown: unknown;
        try {
          await updateBlAchatTx(
            tx,
            created.id,
            {
              blNumero: "BL-TEST-0003-RENAMED",
              lignes: [{ produitId: produit.id, qteAchetee: 99, prixAchatNetHt: 1, tauxTva: 7 }],
            },
            actor,
            ctx,
          );
        } catch (err) {
          thrown = err;
        }

        expect(thrown).toBeInstanceOf(BlAchatHasVentesException);
        expect((thrown as Error).message).toContain("modifier");

        // Header must be untouched since the block happens before any other change.
        const row = await tx.bl_achats.findUniqueOrThrow({ where: { id: created.id } });
        expect(row.bl_numero).toBe("BL-TEST-0003");

        throw new RollbackForTest();
      }),
    );
  });

  it("still allows header-only updates when a line has been drawn from (lignes omitted)", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);

        const created = await createBlAchatTx(
          tx,
          {
            transactionDate: TODAY,
            blNumero: "BL-TEST-0004",
            magasinId,
            fournisseurId,
            lignes: [{ produitId: produit.id, qteAchetee: 10, prixAchatNetHt: 10, tauxTva: 19 }],
          },
          actor,
          ctx,
        );

        await tx.bl_achat_lignes.update({
          where: { id: created.lignes[0]!.id },
          data: { qte_restante: round3(0) },
        });

        const updated = await updateBlAchatTx(
          tx,
          created.id,
          { blNumero: "BL-TEST-0004-RENAMED" },
          actor,
          ctx,
        );

        expect(updated.blNumero).toBe("BL-TEST-0004-RENAMED");
        expect(updated.lignes).toHaveLength(1);
        expect(updated.lignes[0]!.id).toBe(created.lignes[0]!.id);
        expect(updated.lignes[0]!.qteRestante).toBe(0);

        throw new RollbackForTest();
      }),
    );
  });
});

describe("deleteBlAchatTx", () => {
  it("blocks deletion once any line has been drawn from (a real vente_lignes row references it)", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);

        const bl = await createBlAchatTx(
          tx,
          {
            transactionDate: TODAY,
            blNumero: "BL-TEST-0005",
            magasinId,
            fournisseurId,
            lignes: [{ produitId: produit.id, qteAchetee: 10, prixAchatNetHt: 10, tauxTva: 19 }],
          },
          actor,
          ctx,
        );

        await createVenteTx(
          tx,
          { venteDate: TODAY, magasinId, lignes: [{ produitId: produit.id, qteVendue: 4, prixVenteTtc: 20 }] },
          actor,
          ctx,
        );

        let thrown: unknown;
        try {
          await deleteBlAchatTx(tx, bl.id, actor, ctx);
        } catch (err) {
          thrown = err;
        }

        expect(thrown).toBeInstanceOf(BlAchatHasVentesException);
        expect((thrown as Error).message).not.toContain("modifier");

        throw new RollbackForTest();
      }),
    );
  });

  it("soft-deletes the header and its lines when nothing has been drawn from", async () => {
    await runAndRollback(() =>
      prisma.$transaction(async (tx) => {
        const produit = await makeTestProduit(tx);

        const bl = await createBlAchatTx(
          tx,
          {
            transactionDate: TODAY,
            blNumero: "BL-TEST-0006",
            magasinId,
            fournisseurId,
            lignes: [{ produitId: produit.id, qteAchetee: 10, prixAchatNetHt: 10, tauxTva: 19 }],
          },
          actor,
          ctx,
        );

        await deleteBlAchatTx(tx, bl.id, actor, ctx);

        const header = await tx.bl_achats.findUniqueOrThrow({ where: { id: bl.id } });
        expect(header.deleted_at).not.toBeNull();

        const lines = await tx.bl_achat_lignes.findMany({ where: { bl_achat_id: bl.id } });
        expect(lines.every((l) => l.deleted_at !== null)).toBe(true);

        throw new RollbackForTest();
      }),
    );
  });
});
