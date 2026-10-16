import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance, HTTPMethods } from "fastify";
import { buildApplication } from "./application.js";
import { prisma, closeDb } from "./db.js";
import type { LoginResult } from "./auth/service.js";
import type { BlAchatResponse } from "./bl-achats/mappers.js";
import type { VenteResponse } from "./ventes/mappers.js";

const run = randomUUID();
const password = "HttpFixture123";
const traceId = "http-integration-" + run;
const ids: string[] = [];
let app: FastifyInstance;
let admin: LoginResult;
let staff: LoginResult;
let familleId: string | undefined,
  fournisseurId: string | undefined,
  magasinId: string | undefined,
  produitId: string | undefined;
const blIds: string[] = [],
  venteIds: string[] = [];
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Tunis",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
async function request(
  method: HTTPMethods,
  url: string,
  payload?: object,
  session = admin,
) {
  return app.inject({
    method,
    url: "/api/v1" + url,
    payload,
    headers: {
      authorization: "Bearer " + session.accessToken,
      "x-trace-id": traceId,
    },
  });
}
async function createUser(role: "ADMIN" | "SECRETAIRE") {
  const user = await prisma.users.create({
    data: {
      email: "qa.http." + role + "." + randomUUID() + "@apms.invalid",
      password_hash: await bcrypt.hash(password, 12),
      role,
      is_active: true,
      must_change_password: false,
    },
  });
  ids.push(user.id);
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: user.email, password },
    headers: { "x-trace-id": traceId },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<LoginResult>();
}
beforeAll(async () => {
  app = await buildApplication();
  admin = await createUser("ADMIN");
  staff = await createUser("SECRETAIRE");
});
afterAll(async () => {
  // Remove only this run's fixtures, including on a failed assertion. No business
  // records are selected by prefix and no pre-existing account is changed.
  for (const id of venteIds) await request("DELETE", "/ventes/" + id);
  for (const id of blIds) await request("DELETE", "/bl-achats/" + id);
  if (blIds.length) {
    await prisma.bl_achat_lignes.deleteMany({
      where: { bl_achat_id: { in: blIds } },
    });
    await prisma.bl_achats.deleteMany({ where: { id: { in: blIds } } });
  }
  if (produitId) {
    await prisma.stock_legacy_lots.deleteMany({
      where: { produit_id: produitId },
    });
    await prisma.analytics_stock_snapshot.deleteMany({
      where: { produit_id: produitId },
    });
    await prisma.produits.deleteMany({ where: { id: produitId } });
  }
  if (familleId) await prisma.familles.deleteMany({ where: { id: familleId } });
  if (fournisseurId)
    await prisma.fournisseurs.deleteMany({ where: { id: fournisseurId } });
  if (magasinId) await prisma.magasins.deleteMany({ where: { id: magasinId } });
  await prisma.audit_logs.deleteMany({
    where: { OR: [{ trace_id: traceId }, { actor_id: { in: ids } }] },
  });
  await prisma.user_sessions.deleteMany({ where: { user_id: { in: ids } } });
  await prisma.users.deleteMany({ where: { id: { in: ids } } });
  await app.close();
  await closeDb();
});

describe("complete HTTP application", () => {
  it("registers every domain and protects every private route", async () => {
    const ready = await app.inject({ url: "/internal/ready" });
    expect(ready.json()).toEqual({ status: "UP", db: "UP" });
    for (const url of [
      "/auth/me",
      "/users",
      "/familles",
      "/fournisseurs",
      "/magasins",
      "/produits",
      "/bl-achats",
      "/ventes",
      "/stock",
      "/analytics/dashboard",
      "/audit",
      "/transactions/export/excel",
    ]) {
      const res = await app.inject({ url: "/api/v1" + url });
      expect(res.statusCode, url + ": " + res.body).toBe(401);
      expect(res.json()).toMatchObject({
        code: "AUTH_MISSING_TOKEN",
        traceId: expect.any(String),
      });
    }
  });
  it("allows staff référentiels, transactions and export, and refuses administrator resources", async () => {
    for (const url of [
      "/familles",
      "/fournisseurs",
      "/magasins",
      "/produits",
      "/bl-achats",
      "/ventes",
      "/transactions/export/excel",
    ]) {
      const res = await request("GET", url, undefined, staff);
      expect(res.statusCode, url + ": " + res.body.slice(0, 200)).toBe(200);
    }
    for (const url of [
      "/users",
      "/stock",
      "/stock/legacy-lots/lookup",
      "/analytics/dashboard",
      "/analytics/annual-report",
      "/audit",
    ]) {
      expect(
        (await request("GET", url, undefined, staff)).statusCode,
        url,
      ).toBe(403);
    }
  });
  it("performs CRUD, stock draw/reverse/redraw, oversell, search, audit and export through real HTTP handlers", async () => {
    const code = run.replaceAll("-", "").slice(0, 8);
    for (const resource of ["familles", "fournisseurs", "magasins"]) {
      const res = await request("POST", "/" + resource, {
        code,
        nom: "HTTP " + resource,
      });
      expect(res.statusCode, res.body).toBe(201);
      const id = res.json<{ id: string }>().id;
      if (resource === "familles") familleId = id;
      if (resource === "fournisseurs") fournisseurId = id;
      if (resource === "magasins") magasinId = id;
      expect(
        (
          await request("PUT", "/" + resource + "/" + id, {
            nom: "HTTP updated " + resource,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await request("GET", "/" + resource + "/lookup?q=" + code))
          .json<{ id: string }[]>()
          .some((r) => r.id === id),
      ).toBe(true);
    }
    const product = await request("POST", "/produits", {
      reference: "HTTP-" + code,
      designation: "HTTP test product",
      familleId,
    });
    expect(product.statusCode, product.body).toBe(201);
    produitId = product.json<{ id: string }>().id;
    const lignes = [
      { produitId, qteAchetee: 10, prixAchatNetHt: 10, tauxTva: 19 },
    ];
    const purchase = await request("POST", "/bl-achats", {
      transactionDate: today,
      blNumero: "HTTP-" + run,
      magasinId,
      fournisseurId,
      lignes,
    });
    expect(purchase.statusCode, purchase.body).toBe(201);
    const bl = purchase.json<BlAchatResponse>();
    blIds.push(bl.id);
    expect(bl.lignes[0]).toMatchObject({
      qteAchetee: 10,
      qteRestante: 10,
      prixAchatTtc: 11.9,
      prixAchatTotalTtc: 119,
    });
    const sale = await request("POST", "/ventes", {
      venteDate: today,
      magasinId,
      lignes: [{ produitId, qteVendue: 12, prixVenteTtc: 20 }],
    });
    expect(sale.statusCode, sale.body).toBe(201);
    const vente = sale.json<VenteResponse>();
    venteIds.push(vente.id);
    expect(vente).toMatchObject({ totalTtc: 240, hasDepassement: true });
    expect(vente.lignes).toHaveLength(2);
    expect(vente.lignes[1]).toMatchObject({
      qteNonCouverte: 2,
      sourceType: "STOCK_LEGACY",
    });
    for (const response of [
      await request("PUT", "/bl-achats/" + bl.id, { lignes }),
      await request("DELETE", "/bl-achats/" + bl.id),
    ]) {
      expect(response.statusCode, response.body).toBe(422);
      expect(response.json()).toMatchObject({
        code: "BL_ACHAT_HAS_VENTES",
        traceId,
      });
    }
    expect(
      (
        await request("PUT", "/bl-achats/" + bl.id, {
          blNumero: "HTTP-edited-" + run,
        })
      ).statusCode,
    ).toBe(200);
    const changed = await request("PUT", "/ventes/" + vente.id, {
      venteDate: today,
      magasinId,
      lignes: [{ produitId, qteVendue: 4, prixVenteTtc: 21 }],
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json<VenteResponse>()).toMatchObject({
      totalTtc: 84,
      hasDepassement: false,
    });
    const stock = await request(
      "GET",
      "/stock?magasinId=" + magasinId + "&search=HTTP-" + code,
    );
    expect(stock.json<{ content: object[] }>().content[0]).toMatchObject({
      qteDisponible: 6,
      valeur: 60,
    });
    const search = await request("GET", "/ventes?search=HTTP-" + code);
    expect(
      search
        .json<{ content: { id: string }[] }>()
        .content.some((v) => v.id === vente.id),
    ).toBe(true);
    const history = await request("GET", "/audit/VENTE/" + vente.id);
    expect(history.json<{ action: string }[]>().map((r) => r.action)).toEqual(
      expect.arrayContaining(["CREATE", "UPDATE"]),
    );
    const exported = await request(
      "GET",
      "/transactions/export/excel?magasinId=" +
        magasinId +
        "&dateFrom=" +
        today +
        "&dateTo=" +
        today,
    );
    expect(exported.statusCode, exported.body.slice(0, 100)).toBe(200);
    expect(exported.headers["content-type"]).toContain("spreadsheetml");
    expect(exported.rawPayload.subarray(0, 2).toString()).toBe("PK");
    expect((await request("DELETE", "/ventes/" + vente.id)).statusCode).toBe(
      204,
    );
    expect(
      (await request("GET", "/bl-achats/" + bl.id)).json<BlAchatResponse>()
        .lignes[0]?.qteRestante,
    ).toBe(10);
    expect((await request("DELETE", "/bl-achats/" + bl.id)).statusCode).toBe(
      204,
    );
  });
  it("serializes concurrent draws so covered sales never exceed the actual lot", async () => {
    const purchase = await request("POST", "/bl-achats", {
      transactionDate: today,
      blNumero: "HTTP-race-" + run,
      magasinId,
      fournisseurId,
      lignes: [{ produitId, qteAchetee: 10, prixAchatNetHt: 1, tauxTva: 19 }],
    });
    expect(purchase.statusCode, purchase.body).toBe(201);
    const bl = purchase.json<BlAchatResponse>();
    blIds.push(bl.id);
    const results = await Promise.all(
      [1, 2].map(() =>
        request("POST", "/ventes", {
          venteDate: today,
          magasinId,
          lignes: [{ produitId, qteVendue: 8, prixVenteTtc: 2 }],
        }),
      ),
    );
    const sales = results.map((r) => {
      expect(r.statusCode, r.body).toBe(201);
      const sale = r.json<VenteResponse>();
      venteIds.push(sale.id);
      return sale;
    });
    expect(
      sales.flatMap((v) => v.lignes).reduce((n, l) => n + l.qteNonCouverte, 0),
    ).toBe(6);
    expect(
      (await request("GET", "/bl-achats/" + bl.id)).json<BlAchatResponse>()
        .lignes[0]?.qteRestante,
    ).toBe(0);
    for (const sale of sales)
      expect((await request("DELETE", "/ventes/" + sale.id)).statusCode).toBe(
        204,
      );
  });
  it("returns the analytics fields consumed by the UI and rejects impossible dates", async () => {
    const year = Number(today.slice(0, 4)),
      month = Number(today.slice(5, 7));
    const dashboard = await request(
      "GET",
      "/analytics/dashboard?year=" + year + "&month=" + month,
    );
    expect(dashboard.statusCode, dashboard.body).toBe(200);
    expect(dashboard.json()).toMatchObject({
      totals: { totalAchat: expect.any(Number) },
      topFamillesParVente: expect.any(Array),
      topFamillesParValeur: expect.any(Array),
    });
    const annual = await request(
      "GET",
      "/analytics/annual-report?year=" + year,
    );
    expect(annual.statusCode, annual.body).toBe(200);
    expect(annual.json()).toMatchObject({
      cumulAchat: expect.any(Number),
      cumValeur: expect.any(Number),
      evolution: expect.any(Array),
    });
    const drilldown = await request(
      "GET",
      "/analytics/drilldown/familles/" +
        familleId +
        "?year=" +
        year +
        "&month=" +
        month,
    );
    expect(drilldown.statusCode, drilldown.body).toBe(200);
    expect(drilldown.json()).toMatchObject({
      items: expect.any(Array),
      totals: { totalValeur: expect.any(Number) },
    });
    const bad = await request("POST", "/ventes", {
      venteDate: year + "-02-31",
      magasinId,
      lignes: [{ produitId, qteVendue: 1, prixVenteTtc: 1 }],
    });
    expect(bad.statusCode, bad.body).toBe(400);
  });
  it("keeps stock pagination totals on out-of-range pages and exposes bounded lookups", async () => {
    const first = (await request("GET", "/stock?size=1")).json<{
      page: { totalElements: number };
    }>();
    const last = (await request("GET", "/stock?page=999999&size=1")).json<{
      content: object[];
      page: { totalElements: number };
    }>();
    expect(last.content).toEqual([]);
    expect(last.page.totalElements).toBe(first.page.totalElements);
    for (const resource of [
      "familles",
      "fournisseurs",
      "magasins",
      "produits",
    ]) {
      const lookup = await request(
        "GET",
        "/" + resource + "/lookup?q=HTTP&limit=50",
      );
      expect(lookup.statusCode, lookup.body).toBe(200);
    }
  });
  it("requires a first-login password change and revokes the old refresh session", async () => {
    const email = "qa.http.new." + run + "@apms.invalid";
    const created = await request("POST", "/users", {
      email,
      firstName: "HTTP",
      lastName: "Fixture",
      role: "SECRETAIRE",
      password,
    });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json<{ id: string }>().id;
    ids.push(id);
    const loginResponse = await request("POST", "/auth/login", {
      email,
      password,
    });
    const session = loginResponse.json<LoginResult>();
    expect(session.user.mustChangePassword).toBe(true);
    expect(
      (await request("GET", "/familles", undefined, session)).statusCode,
    ).toBe(403);
    const changed = await request(
      "POST",
      "/auth/change-password",
      { currentPassword: password, newPassword: "ChangedFixture456" },
      session,
    );
    expect(changed.statusCode, changed.body).toBe(204);
    expect(
      (
        await request(
          "POST",
          "/auth/refresh",
          { refreshToken: session.refreshToken },
          session,
        )
      ).statusCode,
    ).toBe(401);
    const renewed = await request("POST", "/auth/login", {
      email,
      password: "ChangedFixture456",
    });
    expect(renewed.statusCode, renewed.body).toBe(200);
    expect(renewed.json<LoginResult>().user.mustChangePassword).toBe(false);
  });
  it("rotates a refresh token once under concurrent requests and refuses disabled users", async () => {
    const login = await createUser("SECRETAIRE");
    const rotated = await Promise.all(
      [1, 2].map(() =>
        request(
          "POST",
          "/auth/refresh",
          { refreshToken: login.refreshToken },
          login,
        ),
      ),
    );
    expect(rotated.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    await prisma.users.update({
      where: { id: login.user.id },
      data: { is_active: false },
    });
    expect(
      (await request("GET", "/familles", undefined, login)).statusCode,
    ).toBe(401);
    const survivor = rotated
      .find((r) => r.statusCode === 200)!
      .json<LoginResult>();
    expect(
      (
        await request(
          "POST",
          "/auth/refresh",
          { refreshToken: survivor.refreshToken },
          survivor,
        )
      ).statusCode,
    ).toBe(401);
  });
});
