import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma, Prisma } from "../db.js";
import { signAccessToken } from "../plugins/auth.js";
import type { CurrentUser } from "../common/current-user.js";
import { registerProduitRoutes } from "./routes.js";
import { createProduitTx, deleteProduitTx, updateProduitTx } from "./service.js";
import { updateProduitSchema } from "./schemas.js";

/**
 * Thrown deliberately inside `runInRollback`'s transaction so every mutation made by
 * the wrapped callback is rolled back — the shared local Postgres keeps no trace of it.
 */
class RollbackForTest extends Error {}

async function runInRollback<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await prisma.$transaction(async (tx) => {
      result = await fn(tx);
      throw new RollbackForTest();
    });
  } catch (err) {
    if (!(err instanceof RollbackForTest)) throw err;
  }
  return result;
}

describe("produits routes", () => {
  let app: FastifyInstance;
  let actor: CurrentUser;
  let token: string;
  let existingProduit: { id: string; reference: string; designation: string; famille_id: string };
  let familleA: { id: string; nom: string };
  let familleB: { id: string; nom: string };

  beforeAll(async () => {
    app = await buildApp();
    await app.register(registerProduitRoutes, { prefix: "/api/v1" });
    await app.ready();

    const userRow = await prisma.users.findFirst({ where: { deleted_at: null } });
    if (!userRow) throw new Error("Fixture requires at least one user row in the DB.");
    actor = { id: userRow.id, email: userRow.email, role: userRow.role as CurrentUser["role"] };
    token = signAccessToken(actor);

    const produitRow = await prisma.produits.findFirst({ where: { deleted_at: null } });
    if (!produitRow) throw new Error("Fixture requires at least one produit row in the DB.");
    existingProduit = produitRow;

    const familles = await prisma.familles.findMany({
      where: { deleted_at: null },
      take: 2,
      orderBy: { code: "asc" },
    });
    if (familles.length < 2) throw new Error("Fixture requires at least two famille rows in the DB.");
    const [a, b] = familles;
    if (!a || !b) throw new Error("Fixture requires at least two famille rows in the DB.");
    familleA = a;
    familleB = b;
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/produits" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /produits returns a paged envelope with familleNom joined in", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/produits?page=0&size=5",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toMatchObject({ page: 0, size: 5 });
    expect(Array.isArray(body.content)).toBe(true);
    if (body.content.length > 0) {
      expect(body.content[0]).toHaveProperty("familleNom");
    }
  });

  it("GET /produits?search matches case-insensitively on reference/designation", async () => {
    const search = existingProduit.reference.toLowerCase();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/produits?search=${encodeURIComponent(search)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content.some((p: { id: string }) => p.id === existingProduit.id)).toBe(true);
  });

  it("GET /produits?familleId filters to that famille only", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/produits?familleId=${existingProduit.famille_id}&size=200`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content.length).toBeGreaterThan(0);
    expect(body.content.every((p: { familleId: string }) => p.familleId === existingProduit.famille_id)).toBe(true);
  });

  it("GET /produits/lookup returns a bare array shaped {id, reference, label}", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/produits/lookup?q=${encodeURIComponent(existingProduit.reference)}&limit=5`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    const match = body.find((p: { id: string }) => p.id === existingProduit.id);
    expect(match).toMatchObject({
      id: existingProduit.id,
      reference: existingProduit.reference,
      label: existingProduit.designation,
    });
  });

  it("GET /produits/:id returns the produit with familleNom", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/produits/${existingProduit.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: existingProduit.id,
      reference: existingProduit.reference,
      familleId: existingProduit.famille_id,
    });
  });

  it("GET /produits/:id 404s for a missing id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/produits/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("PRODUIT_NOT_FOUND");
  });

  it("update schema omits `reference` entirely — sending it is silently dropped, never applied", () => {
    const parsed = updateProduitSchema.parse({ reference: "HACKED", designation: "New designation" });
    expect(parsed).not.toHaveProperty("reference");
    expect(parsed.designation).toBe("New designation");
  });

  it("create -> update (incl. famille reassignment) -> soft-delete happy path (rolled back)", async () => {
    await runInRollback(async (tx) => {
      const reference = `ZPREF-${Date.now()}`;
      const created = await createProduitTx(
        tx,
        { reference, designation: "Produit Test Zone", familleId: familleA.id },
        actor,
      );
      expect(created.reference).toBe(reference);
      expect(created.familleId).toBe(familleA.id);
      expect(created.familleNom).toBe(familleA.nom);
      expect(created.isActive).toBe(true);

      const updated = await updateProduitTx(
        tx,
        created.id,
        { designation: "Produit Test Zone Updated", familleId: familleB.id },
        actor,
      );
      expect(updated.designation).toBe("Produit Test Zone Updated");
      expect(updated.familleId).toBe(familleB.id);
      expect(updated.familleNom).toBe(familleB.nom);
      expect(updated.reference).toBe(reference);

      await deleteProduitTx(tx, created.id, actor);
      const afterDelete = await tx.produits.findFirst({ where: { id: created.id } });
      expect(afterDelete?.deleted_at).not.toBeNull();
      expect(afterDelete?.deleted_by).toBe(actor.id);
    });
  });

  it("rejects a duplicate reference among non-deleted produits on create", async () => {
    await runInRollback(async (tx) => {
      const reference = `ZPDUP-${Date.now()}`;
      await createProduitTx(tx, { reference, designation: "First", familleId: familleA.id }, actor);

      await expect(
        createProduitTx(tx, { reference, designation: "Second", familleId: familleA.id }, actor),
      ).rejects.toMatchObject({ code: "PRODUIT_REFERENCE_DUPLICATE" });
    });
  });
});
