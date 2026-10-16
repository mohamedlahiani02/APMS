import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { prisma, Prisma } from "../db.js";
import { signAccessToken } from "../plugins/auth.js";
import type { CurrentUser } from "../common/current-user.js";
import { registerFournisseurRoutes } from "./routes.js";
import { createFournisseurTx, deleteFournisseurTx, updateFournisseurTx } from "./service.js";
import { updateFournisseurSchema } from "./schemas.js";

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

describe("fournisseurs routes", () => {
  let app: FastifyInstance;
  let actor: CurrentUser;
  let token: string;
  let existingFournisseur: { id: string; code: string; nom: string };

  beforeAll(async () => {
    app = await buildApp();
    await app.register(registerFournisseurRoutes, { prefix: "/api/v1" });
    await app.ready();

    const userRow = await prisma.users.findFirst({ where: { deleted_at: null } });
    if (!userRow) throw new Error("Fixture requires at least one user row in the DB.");
    actor = { id: userRow.id, email: userRow.email, role: userRow.role as CurrentUser["role"] };
    token = signAccessToken(actor);

    const row = await prisma.fournisseurs.findFirst({ where: { deleted_at: null } });
    if (!row) throw new Error("Fixture requires at least one fournisseur row in the DB.");
    existingFournisseur = row;
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/fournisseurs" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /fournisseurs returns a paged envelope of non-deleted fournisseurs", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/fournisseurs?page=0&size=5",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toMatchObject({ page: 0, size: 5 });
    expect(Array.isArray(body.content)).toBe(true);
  });

  it("GET /fournisseurs?search matches case-insensitively on code/nom", async () => {
    const search = existingFournisseur.code.toLowerCase();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/fournisseurs?search=${encodeURIComponent(search)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content.some((f: { id: string }) => f.id === existingFournisseur.id)).toBe(true);
  });

  it("GET /fournisseurs/lookup returns a bare array shaped {id, code, label}", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/fournisseurs/lookup?q=${encodeURIComponent(existingFournisseur.code)}&limit=5`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    const match = body.find((f: { id: string }) => f.id === existingFournisseur.id);
    expect(match).toMatchObject({
      id: existingFournisseur.id,
      code: existingFournisseur.code,
      label: existingFournisseur.nom,
    });
  });

  it("GET /fournisseurs/:id returns the fournisseur", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/fournisseurs/${existingFournisseur.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: existingFournisseur.id, code: existingFournisseur.code });
  });

  it("GET /fournisseurs/:id 404s for a missing id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/fournisseurs/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("FOURNISSEUR_NOT_FOUND");
  });

  it("update schema omits `code` entirely — sending it is silently dropped, never applied", () => {
    const parsed = updateFournisseurSchema.parse({ code: "HACKED", nom: "New name" });
    expect(parsed).not.toHaveProperty("code");
    expect(parsed.nom).toBe("New name");
  });

  it("create -> update -> soft-delete happy path (rolled back, no trace left)", async () => {
    await runInRollback(async (tx) => {
      const created = await createFournisseurTx(
        tx,
        { code: "ZF9", nom: "Zone Fournisseur Test", email: "zone-test@example.com" },
        actor,
      );
      expect(created.code).toBe("ZF9");
      expect(created.isActive).toBe(true);

      const updated = await updateFournisseurTx(tx, created.id, { nom: "Zone Fournisseur Updated" }, actor);
      expect(updated.nom).toBe("Zone Fournisseur Updated");
      expect(updated.code).toBe("ZF9");

      await deleteFournisseurTx(tx, created.id, actor);
      const afterDelete = await tx.fournisseurs.findFirst({ where: { id: created.id } });
      expect(afterDelete?.deleted_at).not.toBeNull();
      expect(afterDelete?.deleted_by).toBe(actor.id);
    });
  });
});
