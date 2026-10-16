import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma, Prisma } from "../db.js";
import { signAccessToken } from "../plugins/auth.js";
import type { CurrentUser } from "../common/current-user.js";
import { registerMagasinRoutes } from "./routes.js";
import { createMagasinTx, deleteMagasinTx, updateMagasinTx } from "./service.js";
import { updateMagasinSchema } from "./schemas.js";

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

describe("magasins routes", () => {
  let app: FastifyInstance;
  let actor: CurrentUser;
  let token: string;
  let existingMagasin: { id: string; code: string; nom: string };

  beforeAll(async () => {
    app = await buildApp();
    await app.register(registerMagasinRoutes, { prefix: "/api/v1" });
    await app.ready();

    const userRow = await prisma.users.findFirst({ where: { deleted_at: null } });
    if (!userRow) throw new Error("Fixture requires at least one user row in the DB.");
    actor = { id: userRow.id, email: userRow.email, role: userRow.role as CurrentUser["role"] };
    token = signAccessToken(actor);

    const row = await prisma.magasins.findFirst({ where: { deleted_at: null } });
    if (!row) throw new Error("Fixture requires at least one magasin row in the DB.");
    existingMagasin = row;
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/magasins" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /magasins returns a paged envelope of non-deleted magasins", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/magasins?page=0&size=5",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toMatchObject({ page: 0, size: 5 });
    expect(Array.isArray(body.content)).toBe(true);
  });

  it("GET /magasins?search matches case-insensitively on code/nom", async () => {
    const search = existingMagasin.code.toLowerCase();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/magasins?search=${encodeURIComponent(search)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content.some((m: { id: string }) => m.id === existingMagasin.id)).toBe(true);
  });

  it("GET /magasins/lookup returns a bare array shaped {id, code, label}", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/magasins/lookup?q=${encodeURIComponent(existingMagasin.code)}&limit=5`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    const match = body.find((m: { id: string }) => m.id === existingMagasin.id);
    expect(match).toMatchObject({ id: existingMagasin.id, code: existingMagasin.code, label: existingMagasin.nom });
  });

  it("GET /magasins/:id returns the magasin", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/magasins/${existingMagasin.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: existingMagasin.id, code: existingMagasin.code });
  });

  it("GET /magasins/:id 404s for a missing id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/magasins/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("MAGASIN_NOT_FOUND");
  });

  it("update schema omits `code` entirely — sending it is silently dropped, never applied", () => {
    const parsed = updateMagasinSchema.parse({ code: "HACKED", nom: "New name" });
    expect(parsed).not.toHaveProperty("code");
    expect(parsed.nom).toBe("New name");
  });

  it("create -> update -> soft-delete happy path (rolled back, no trace left)", async () => {
    await runInRollback(async (tx) => {
      const created = await createMagasinTx(tx, { code: "ZM9", nom: "Zone Magasin Test", ville: "Tunis" }, actor);
      expect(created.code).toBe("ZM9");
      expect(created.isActive).toBe(true);

      const updated = await updateMagasinTx(tx, created.id, { nom: "Zone Magasin Updated" }, actor);
      expect(updated.nom).toBe("Zone Magasin Updated");
      expect(updated.code).toBe("ZM9");

      await deleteMagasinTx(tx, created.id, actor);
      const afterDelete = await tx.magasins.findFirst({ where: { id: created.id } });
      expect(afterDelete?.deleted_at).not.toBeNull();
      expect(afterDelete?.deleted_by).toBe(actor.id);
    });
  });
});
