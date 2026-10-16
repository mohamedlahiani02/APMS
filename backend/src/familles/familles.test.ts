import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma, Prisma } from "../db.js";
import { signAccessToken } from "../plugins/auth.js";
import type { CurrentUser } from "../common/current-user.js";
import { registerFamilleRoutes } from "./routes.js";
import { createFamilleTx, deleteFamilleTx, updateFamilleTx } from "./service.js";
import { updateFamilleSchema } from "./schemas.js";

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

describe("familles routes", () => {
  let app: FastifyInstance;
  let actor: CurrentUser;
  let token: string;
  let existingFamille: { id: string; code: string; nom: string };

  beforeAll(async () => {
    app = await buildApp();
    await app.register(registerFamilleRoutes, { prefix: "/api/v1" });
    await app.ready();

    const userRow = await prisma.users.findFirst({ where: { deleted_at: null } });
    if (!userRow) throw new Error("Fixture requires at least one user row in the DB.");
    actor = { id: userRow.id, email: userRow.email, role: userRow.role as CurrentUser["role"] };
    token = signAccessToken(actor);

    const familleRow = await prisma.familles.findFirst({ where: { deleted_at: null } });
    if (!familleRow) throw new Error("Fixture requires at least one famille row in the DB.");
    existingFamille = familleRow;
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/familles" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /familles returns a paged envelope of non-deleted familles", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/familles?page=0&size=5",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toMatchObject({ page: 0, size: 5 });
    expect(Array.isArray(body.content)).toBe(true);
  });

  it("GET /familles?search matches case-insensitively on code/nom", async () => {
    const search = existingFamille.code.toLowerCase();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/familles?search=${encodeURIComponent(search)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content.some((f: { id: string }) => f.id === existingFamille.id)).toBe(true);
  });

  it("GET /familles/lookup returns a bare array shaped {id, code, label}", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/familles/lookup?q=${encodeURIComponent(existingFamille.code)}&limit=5`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    const match = body.find((f: { id: string }) => f.id === existingFamille.id);
    expect(match).toMatchObject({ id: existingFamille.id, code: existingFamille.code, label: existingFamille.nom });
  });

  it("GET /familles/:id returns the famille", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/familles/${existingFamille.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: existingFamille.id, code: existingFamille.code });
  });

  it("GET /familles/:id 404s for a missing id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/familles/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("FAMILLE_NOT_FOUND");
  });

  it("update schema omits `code` entirely — sending it is silently dropped, never applied", () => {
    const parsed = updateFamilleSchema.parse({ code: "HACKED", nom: "New name" });
    expect(parsed).not.toHaveProperty("code");
    expect(parsed.nom).toBe("New name");
  });

  it("create -> update -> soft-delete happy path (rolled back, no trace left)", async () => {
    await runInRollback(async (tx) => {
      const created = await createFamilleTx(tx, { code: "ZT9", nom: "Zone Test" }, actor);
      expect(created.code).toBe("ZT9");
      expect(created.isActive).toBe(true);

      const updated = await updateFamilleTx(tx, created.id, { nom: "Zone Test Updated" }, actor);
      expect(updated.nom).toBe("Zone Test Updated");
      expect(updated.code).toBe("ZT9");

      await deleteFamilleTx(tx, created.id, actor);
      const afterDelete = await tx.familles.findFirst({ where: { id: created.id } });
      expect(afterDelete?.deleted_at).not.toBeNull();
      expect(afterDelete?.deleted_by).toBe(actor.id);
    });
  });

  it("blocks delete with FAMILLE_HAS_PRODUITS when non-deleted produits reference it", async () => {
    await runInRollback(async (tx) => {
      const famille = await createFamilleTx(tx, { code: "ZB1", nom: "Zone Blocked" }, actor);
      await tx.produits.create({
        data: {
          reference: `ZBREF-${Date.now()}`,
          designation: "Produit test",
          famille_id: famille.id,
          created_by: actor.id,
        },
      });

      await expect(deleteFamilleTx(tx, famille.id, actor)).rejects.toMatchObject({
        code: "FAMILLE_HAS_PRODUITS",
      });
    });
  });
});
