import ExcelJS from "exceljs";
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
  it("combines list filters with identical export scope and current-stock availability", async () => {
    const purchaseId = blIds[blIds.length - 1];
    const stockFilter = "?magasinId=" + magasinId + "&familleId=" + familleId;
    const positive = await request(
      "GET",
      "/stock" + stockFilter + "&availability=positive",
    );
    expect(positive.statusCode, positive.body).toBe(200);
    expect(positive.json().content).toHaveLength(1);
    expect(positive.json().content[0].qteDisponible).toBe(10);
    expect(
      (
        await request("GET", "/stock" + stockFilter + "&availability=zero")
      ).json().content,
    ).toHaveLength(0);
    const filters =
      "?magasinId=" + magasinId + "&fournisseurId=" + fournisseurId;
    expect(
      (await request("GET", "/bl-achats" + filters + "&consumed=no"))
        .json()
        .content.map((r: { id: string }) => r.id),
    ).toContain(purchaseId);
    expect(
      (await request("GET", "/bl-achats" + filters + "&consumed=yes")).json()
        .content,
    ).toHaveLength(0);
    const sale = await request("POST", "/ventes", {
      venteDate: today,
      magasinId,
      lignes: [{ produitId, qteVendue: 12, prixVenteTtc: 2 }],
    });
    expect(sale.statusCode, sale.body).toBe(201);
    const vente = sale.json<VenteResponse>();
    venteIds.push(vente.id);
    const saleFilters =
      "?magasinId=" +
      magasinId +
      "&dateFrom=" +
      today +
      "&dateTo=" +
      today +
      "&search=HTTP-&hasDepassement=true";
    const matching = await request("GET", "/ventes" + saleFilters);
    expect(matching.statusCode, matching.body).toBe(200);
    expect(matching.json().content.map((r: { id: string }) => r.id)).toEqual([
      vente.id,
    ]);
    expect(
      (
        await request("GET", "/ventes" + saleFilters.replace("true", "false"))
      ).json().content,
    ).toHaveLength(0);
    expect(
      (await request("GET", "/bl-achats" + filters + "&consumed=yes"))
        .json()
        .content.map((r: { id: string }) => r.id),
    ).toContain(purchaseId);
    const exported = await request(
      "GET",
      "/transactions/export/excel" + saleFilters + "&type=ventes",
    );
    expect(exported.statusCode).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.rawPayload as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Ventes"]);
    const sheet = workbook.worksheets[0]!;
    let sum = 0;
    sheet.eachRow((row, index) => {
      if (index > 1) sum += Number(row.getCell(6).value);
    });
    expect(sum).toBe(vente.totalTtc);
    expect(sheet.rowCount).toBe(vente.lignes.length + 1);
    const empty = await request(
      "GET",
      "/transactions/export/excel" +
        saleFilters.replace("search=HTTP-", "search=does-not-exist-" + run) +
        "&type=ventes",
    );
    const emptyBook = new ExcelJS.Workbook();
    await emptyBook.xlsx.load(empty.rawPayload as never);
    expect(emptyBook.worksheets[0]!.rowCount).toBe(1);
    expect(
      (
        await request("GET", "/stock" + stockFilter + "&availability=zero")
      ).json().content[0].qteDisponible,
    ).toBe(0);
    expect((await request("DELETE", "/ventes/" + vente.id)).statusCode).toBe(
      204,
    );
  });
  it("filters accounts, active references and audit actions and rejects inverted ranges", async () => {
    const activeStaff = await request(
      "GET",
      "/users?role=SECRETAIRE&isActive=true&sortBy=email&sortDirection=asc&size=50",
    );
    expect(activeStaff.statusCode, activeStaff.body).toBe(200);
    expect(
      activeStaff
        .json()
        .content.every(
          (r: { role: string; isActive: boolean }) =>
            r.role === "SECRETAIRE" && r.isActive,
        ),
    ).toBe(true);
    const emails = activeStaff
      .json()
      .content.map((r: { email: string }) => r.email);
    expect(emails).toEqual([...emails].sort());
    await request("PUT", "/produits/" + produitId, { isActive: false });
    expect(
      (
        await request(
          "GET",
          "/produits?familleId=" + familleId + "&isActive=false",
        )
      )
        .json()
        .content.map((r: { id: string }) => r.id),
    ).toEqual([produitId]);
    expect(
      (
        await request(
          "GET",
          "/produits?familleId=" + familleId + "&isActive=true",
        )
      ).json().content,
    ).toHaveLength(0);
    await request("PUT", "/produits/" + produitId, { isActive: true });
    const audit = await request(
      "GET",
      "/audit?actorId=" +
        admin.user.id +
        "&action=UPDATE&dateFrom=" +
        today +
        "&dateTo=" +
        today,
    );
    expect(audit.statusCode, audit.body).toBe(200);
    expect(audit.json().content.length).toBeGreaterThan(0);
    expect(
      audit
        .json()
        .content.every((r: { action: string }) => r.action === "UPDATE"),
    ).toBe(true);
    for (const resource of [
      "/bl-achats",
      "/ventes",
      "/audit",
      "/transactions/export/excel",
    ]) {
      const invalid = await request(
        "GET",
        resource + "?dateFrom=2026-10-10&dateTo=2026-10-01",
      );
      expect(invalid.statusCode, resource + invalid.body).toBe(400);
      expect(
        (await request("GET", resource + "?dateFrom=2026-02-31")).statusCode,
      ).toBe(400);
    }
  });
  it("applies KPI scope to totals, previous month and drilldown together", async () => {
    const period =
      "?year=" +
      Number(today.slice(0, 4)) +
      "&month=" +
      Number(today.slice(5, 7));
    const scope =
      "&magasinId=" +
      magasinId +
      "&familleId=" +
      familleId +
      "&fournisseurId=" +
      fournisseurId;
    const response = await request(
      "GET",
      "/analytics/dashboard" + period + scope,
    );
    expect(response.statusCode, response.body).toBe(200);
    const dashboard = response.json();
    expect(dashboard.totals.totalAchat).toBeCloseTo(11.9, 2);
    expect(dashboard.totals.totalVente).toBe(0);
    expect(
      dashboard.parFamille.map((r: { familleId: string }) => r.familleId),
    ).toEqual([familleId]);
    expect(
      dashboard.parMagasin.map((r: { magasinId: string }) => r.magasinId),
    ).toEqual([magasinId]);
    expect(
      dashboard.parFournisseur.map(
        (r: { fournisseurId: string }) => r.fournisseurId,
      ),
    ).toEqual([fournisseurId]);
    expect(dashboard.previousPeriod.totalAchat).toBe(0);
    expect(dashboard.previousPeriod.totalValeur).toBe(0);
    const drilldown = await request(
      "GET",
      "/analytics/drilldown/fournisseurs/" + fournisseurId + period + scope,
    );
    expect(drilldown.statusCode, drilldown.body).toBe(200);
    expect(drilldown.json().totals.totalValeur).toBe(
      dashboard.totals.totalValeur,
    );
    expect(
      drilldown
        .json()
        .items.every(
          (r: { produitId: string; magasinId: string }) =>
            r.produitId === produitId && r.magasinId === magasinId,
        ),
    ).toBe(true);
  });
  it("does not deduct covered legacy sales twice in monthly analytics", async () => {
    const lot = await prisma.stock_legacy_lots.upsert({
      where: {
        produit_id_magasin_id: {
          produit_id: produitId!,
          magasin_id: magasinId!,
        },
      },
      create: {
        produit_id: produitId!,
        magasin_id: magasinId!,
        qte_disponible: 10,
        cout_unitaire: 3,
      },
      update: { qte_disponible: 10, cout_unitaire: 3 },
    });
    let saleId: string | undefined;
    try {
      const response = await request("POST", "/ventes", {
        venteDate: today,
        magasinId,
        lignes: [{ produitId, qteVendue: 14, prixVenteTtc: 5 }],
      });
      expect(response.statusCode, response.body).toBe(201);
      saleId = response.json<VenteResponse>().id;
      venteIds.push(saleId);
      const period =
        "?year=" +
        Number(today.slice(0, 4)) +
        "&month=" +
        Number(today.slice(5, 7));
      const details = await request(
        "GET",
        "/analytics/drilldown/familles/" + familleId + period,
      );
      expect(details.statusCode, details.body).toBe(200);
      const legacy = details
        .json()
        .items.find(
          (row: { produitId: string; fournisseurId: string }) =>
            row.produitId === produitId &&
            row.fournisseurId === "00000000-0000-0000-0000-000000000001",
        );
      expect(legacy).toMatchObject({
        qteStock: 6,
        totalValeur: 18,
        qteDeficit: 0,
      });
    } finally {
      if (saleId) await request("DELETE", "/ventes/" + saleId);
      await prisma.stock_legacy_lots.update({
        where: { id: lot.id },
        data: { qte_disponible: 0, cout_unitaire: 0 },
      });
      await prisma.analytics_snapshot_state.updateMany({
        data: { statut: "A_RECALCULER" },
      });
    }
  });
  it("rebuilds an invalid month safely for twenty concurrent dashboard requests", async () => {
    await prisma.analytics_snapshot_state.updateMany({
      data: { statut: "A_RECALCULER" },
    });
    const route =
      "/analytics/dashboard?year=" +
      Number(today.slice(0, 4)) +
      "&month=" +
      Number(today.slice(5, 7));
    const results = await Promise.all(
      Array.from({ length: 20 }, () => request("GET", route)),
    );
    for (const response of results)
      expect(response.statusCode, response.body).toBe(200);
    expect(results.map((r) => r.json().totals)).toEqual(
      Array.from({ length: 20 }, () => results[0]!.json().totals),
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
