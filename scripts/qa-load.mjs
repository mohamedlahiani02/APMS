/** Bounded local API correctness/load test; creates and removes its own empty database. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireBackend = createRequire(path.join(root, "backend/package.json"));
const { Client } = requireBackend("pg"),
  bcrypt = requireBackend("bcrypt");
const local = requireBackend("dotenv").parse(
  fs.readFileSync(path.join(root, "backend/.env")),
);
const original = new URL(local.DATABASE_URL);
if (
  !["127.0.0.1", "localhost"].includes(original.hostname) ||
  original.port !== "5433"
)
  throw Error("QA only permits the local development PostgreSQL on port 5433.");
const dbName = "apms_qa_" + randomBytes(8).toString("hex");
const scratch = new URL(original);
scratch.pathname = "/" + dbName;
const admin = new Client({ connectionString: original.toString() });
const durationMs = Number(process.env.QA_STAGE_MS ?? 8000);
if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 30000)
  throw Error("QA_STAGE_MS must be 1000..30000.");
const report = {
  baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  startedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: process.platform,
    logicalCpus: os.cpus().length,
  },
  dataset: {},
  checks: [],
  coldBurst: {},
  stages: [],
  limitations: [
    "Local API process and synthetic empty-database fixtures; no real-server capacity or browser rendering claim.",
    "Closed-loop concurrency without user think time, not a maximum-capacity certification.",
  ],
  cleanedUp: false,
};
const reportPath = path.resolve(
  root,
  process.env.QA_REPORT ?? "docs/QA_LOAD_REPORT.json",
);
if (!reportPath.startsWith(root + path.sep))
  throw Error("QA report must stay within this repository.");
let created = false,
  app,
  db,
  base,
  token,
  store,
  family,
  supplier;
const check = (name, actual, expected, tolerance = 0.000001) => {
  const pass =
    typeof actual === "number" && typeof expected === "number"
      ? Math.abs(actual - expected) <= tolerance
      : JSON.stringify(actual) === JSON.stringify(expected);
  report.checks.push({ name, actual, expected, pass });
  if (!pass)
    console.log(
      "FAILED: " +
        name +
        " (" +
        JSON.stringify(actual) +
        " instead of " +
        JSON.stringify(expected) +
        ")",
    );
};
async function api(method, route, payload) {
  const response = await fetch(base + "/api/v1" + route, {
    method,
    headers: {
      authorization: "Bearer " + token,
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok)
    throw Error(
      method +
        " " +
        route +
        ": " +
        response.status +
        " " +
        (typeof data === "object" ? data.code : text.slice(0, 120)),
    );
  return data;
}
const product = async (reference) =>
  db.prisma.produits.create({
    data: { reference, designation: "QA " + reference, famille_id: family.id },
  });
const buy = (p, q, price, tva = 19) =>
  api("POST", "/bl-achats", {
    transactionDate: today,
    blNumero: "QA-" + randomUUID(),
    magasinId: store.id,
    fournisseurId: supplier.id,
    lignes: [
      { produitId: p.id, qteAchetee: q, prixAchatNetHt: price, tauxTva: tva },
    ],
  });
const sell = (p, q, price) =>
  api("POST", "/ventes", {
    venteDate: today,
    magasinId: store.id,
    lignes: [{ produitId: p.id, qteVendue: q, prixVenteTtc: price }],
  });
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Tunis",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const year = Number(today.slice(0, 4)),
  month = Number(today.slice(5, 7));
const kpiPath = "/analytics/dashboard?year=" + year + "&month=" + month;
const drill = (p) =>
  api(
    "GET",
    "/analytics/drilldown/familles/" +
      family.id +
      "?year=" +
      year +
      "&month=" +
      month,
  ).then((d) => d.items.filter((r) => r.produitId === p.id));
async function stock(p) {
  return (
    await api("GET", "/stock?search=" + p.reference + "&magasinId=" + store.id)
  ).content.find((r) => r.produitId === p.id);
}
async function stage(concurrency, kind) {
  const timings = [],
    statuses = {},
    errors = [],
    start = performance.now(),
    cpu = process.cpuUsage(),
    delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const routes = [
    "/produits?size=10&search=QA",
    "/stock?size=10&sortBy=qteDisponible&sortDirection=desc",
    "/bl-achats?size=10&consumed=no",
    "/ventes?size=10&hasDepassement=false",
    "/audit?size=10&action=CREATE",
    kpiPath,
  ];
  let count = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (performance.now() - start < durationMs) {
        const index = count++,
          route = routes[index % routes.length],
          t = performance.now();
        try {
          const r = await fetch(base + "/api/v1" + route, {
            headers: { authorization: "Bearer " + token },
            signal: AbortSignal.timeout(15000),
          });
          await r.arrayBuffer();
          statuses[r.status] = (statuses[r.status] ?? 0) + 1;
          if (!r.ok && errors.length < 5)
            errors.push(route + " HTTP " + r.status);
        } catch (error) {
          statuses.network = (statuses.network ?? 0) + 1;
          if (errors.length < 5) errors.push(error.message);
        }
        timings.push(performance.now() - t);
      }
    }),
  );
  delay.disable();
  timings.sort((a, b) => a - b);
  const elapsed = performance.now() - start,
    cpuUsed = process.cpuUsage(cpu);
  const result = {
    kind,
    concurrency,
    requests: timings.length,
    elapsedMs: Math.round(elapsed),
    requestsPerSecond: Number((timings.length / (elapsed / 1000)).toFixed(1)),
    p50Ms: Math.round(timings[Math.floor(timings.length * 0.5)] ?? 0),
    p95Ms: Math.round(timings[Math.floor(timings.length * 0.95)] ?? 0),
    p99Ms: Math.round(timings[Math.floor(timings.length * 0.99)] ?? 0),
    maxMs: Math.round(timings.at(-1) ?? 0),
    statuses,
    errors,
    eventLoopP95Ms: Math.round(delay.percentile(95) / 1e6),
    cpuMs: Math.round((cpuUsed.user + cpuUsed.system) / 1000),
    rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };
  report.stages.push(result);
  console.log(JSON.stringify(result));
}
try {
  await admin.connect();
  await admin.query("CREATE DATABASE " + dbName);
  created = true;
  const env = {
    ...process.env,
    DATABASE_URL: scratch.toString(),
    NODE_ENV: "test",
    JWT_SECRET: randomBytes(40).toString("hex"),
  };
  Object.assign(process.env, env);
  execFileSync(
    process.execPath,
    [requireBackend.resolve("prisma/build/index.js"), "migrate", "deploy"],
    { cwd: path.join(root, "backend"), env, stdio: "pipe" },
  );
  db = await import(pathToFileURL(path.join(root, "backend/dist/db.js")));
  const { buildApplication } = await import(
    pathToFileURL(path.join(root, "backend/dist/application.js"))
  );
  // Populate only this scratch calendar; no copy or mutation of restored business data.
  await db.pool.query(
    "INSERT INTO calendar(date_id,date_full,annee,semestre,trimestre,mois,semaine,jour_semaine,nom_mois,nom_jour,est_weekend) SELECT to_char(d,'YYYYMMDD')::int,d::date,extract(year from d),CASE WHEN extract(month from d)<=6 THEN 1 ELSE 2 END,extract(quarter from d),extract(month from d),extract(week from d),extract(isodow from d),to_char(d,'Month'),to_char(d,'Day'),extract(isodow from d)>=6 FROM generate_series($1::date,$2::date,interval '1 day') d",
    [year + "-01-01", year + "-12-31"],
  );
  const password = randomBytes(20).toString("hex");
  const user = await db.prisma.users.create({
    data: {
      email: "qa@apms.invalid",
      password_hash: await bcrypt.hash(password, 12),
      role: "ADMIN",
      must_change_password: false,
    },
  });
  await db.prisma.fournisseurs.create({
    data: {
      id: "00000000-0000-0000-0000-000000000001",
      code: "LEGACY",
      nom: "QA legacy supplier",
    },
  });
  family = await db.prisma.familles.create({
    data: { code: "QA", nom: "QA family" },
  });
  store = await db.prisma.magasins.create({
    data: { code: "QA", nom: "QA store" },
  });
  supplier = await db.prisma.fournisseurs.create({
    data: { code: "QA", nom: "QA supplier" },
  });
  app = await buildApplication();
  await app.listen({ host: "127.0.0.1", port: 0 });
  base = app.listeningOrigin;
  const login = await fetch(base + "/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: user.email, password }),
  });
  if (!login.ok) throw Error("Scratch login failed");
  token = (await login.json()).accessToken;
  // Hand-calculated fixed decimal vectors, independent from production helpers.
  const vectors = [
    { q: 1.125, p: 7.505, t: 19, unit: 8.931, total: 10.047 },
    { q: 2.5, p: 0.1, t: 7, unit: 0.107, total: 0.268 },
    { q: 0.001, p: 1.005, t: 13, unit: 1.136, total: 0.001 },
    { q: 3, p: 0.05, t: 13, unit: 0.057, total: 0.171 },
  ];
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i],
      p = await product("QA-ROUND-" + i),
      b = await buy(p, v.q, v.p, v.t);
    check("TVA and HALF_UP unit " + i, b.lignes[0].prixAchatTtc, v.unit);
    check(
      "Fractional quantity total " + i,
      b.lignes[0].prixAchatTotalTtc,
      v.total,
    );
  }
  const p = await product("QA-CMUP");
  const first = await buy(p, 10, 10),
    second = await buy(p, 20, 20);
  let sale = await sell(p, 12, 30);
  check(
    "FIFO source split",
    sale.lignes.map((l) => l.qteVendue),
    [10, 2],
  );
  check("Sale total", sale.totalTtc, 360);
  check("Live stock after sale", (await stock(p)).qteDisponible, 18);
  check("Live lot-cost value", (await stock(p)).valeur, 360);
  let rows = await drill(p);
  check("Weighted-average month-end stock", rows[0].qteStock, 18);
  check("Weighted-average cost", rows[0].cmupCumule, 16.667);
  check("Weighted-average month-end value", rows[0].totalValeur, 300);
  await api("PUT", "/ventes/" + sale.id, {
    venteDate: today,
    magasinId: store.id,
    lignes: [{ produitId: p.id, qteVendue: 3, prixVenteTtc: 35 }],
  });
  check(
    "Edited sale reverse/redraw quantity",
    (await stock(p)).qteDisponible,
    27,
  );
  check("Edited sale lot valuation", (await stock(p)).valeur, 470);
  await api("DELETE", "/ventes/" + sale.id);
  check("Deleted sale restores stock", (await stock(p)).qteDisponible, 30);
  sale = await sell(p, 35, 2);
  check(
    "Oversell quantity",
    sale.lignes.reduce((n, l) => n + l.qteNonCouverte, 0),
    5,
  );
  check("Oversell revenue retained", sale.totalTtc, 70);
  check("Oversell stock clamped", (await stock(p)).qteDisponible, 0);
  rows = await drill(p);
  check(
    "Oversell analytic deficit",
    rows.reduce((n, r) => n + r.qteDeficit, 0),
    5,
  );
  await api("DELETE", "/ventes/" + sale.id);
  check(
    "Deleting oversell creates no phantom stock",
    (await stock(p)).qteDisponible,
    30,
  );
  const legacy = await product("QA-LEGACY");
  await db.prisma.stock_legacy_lots.create({
    data: {
      produit_id: legacy.id,
      magasin_id: store.id,
      qte_disponible: 10,
      cout_unitaire: 3,
    },
  });
  const legacySale = await sell(legacy, 4, 5);
  check("Legacy live stock", (await stock(legacy)).qteDisponible, 6);
  rows = await drill(legacy);
  check(
    "Legacy analytic stock must match remaining stock",
    rows[0]?.qteStock ?? 0,
    6,
  );
  check("Legacy analytic value", rows[0]?.totalValeur ?? 0, 18);
  if (month > 1) {
    const historical = await api(
      "GET",
      "/analytics/drilldown/familles/" +
        family.id +
        "?year=" +
        year +
        "&month=" +
        (month - 1),
    );
    check(
      "Legacy historical balance before later sale",
      historical.items.find((r) => r.produitId === legacy.id)?.qteStock ?? 0,
      10,
    );
  }
  await api("DELETE", "/ventes/" + legacySale.id);
  const legacyOversell = await sell(legacy, 12, 5);
  rows = await drill(legacy);
  check(
    "Legacy oversell deficit is only uncovered quantity",
    rows.reduce((n, r) => n + r.qteDeficit, 0),
    2,
  );
  await api("DELETE", "/ventes/" + legacyOversell.id);
  const secondSupplier = await db.prisma.fournisseurs.create({
    data: { code: "QA2", nom: "QA second supplier" },
  });
  await api("GET", kpiPath);
  await api("PUT", "/bl-achats/" + second.id, {
    fournisseurId: secondSupplier.id,
  });
  const reassigned = await api(
    "GET",
    kpiPath + "&fournisseurId=" + secondSupplier.id,
  );
  check(
    "Header-only supplier edit invalidates KPI cache",
    reassigned.totals.totalAchat,
    476,
  );
  await api("PUT", "/bl-achats/" + second.id, { fournisseurId: supplier.id });
  const otherFamily = await db.prisma.familles.create({
    data: { code: "QA2", nom: "QA second family" },
  });
  await api("GET", kpiPath);
  await api("PUT", "/produits/" + p.id, { familleId: otherFamily.id });
  const regrouped = await api("GET", kpiPath + "&familleId=" + otherFamily.id);
  check(
    "Product family edit invalidates KPI cache",
    regrouped.totals.totalAchat,
    595,
  );
  await api("PUT", "/produits/" + p.id, { familleId: family.id });
  // Two dates, an action and an entity are combined with AND at the API.
  const audit = await api(
    "GET",
    "/audit?entityType=VENTE&action=DELETE&dateFrom=" +
      today +
      "&dateTo=" +
      today,
  );
  check(
    "Cumulative audit filters",
    audit.content.length > 0 &&
      audit.content.every(
        (r) => r.entityType === "VENTE" && r.action === "DELETE",
      ),
    true,
  );
  const race = await product("QA-RACE");
  await buy(race, 10, 1);
  const parallel = await Promise.all(
    Array.from({ length: 10 }, () => sell(race, 2, 3)),
  );
  check(
    "Concurrent sales cannot overdraw covered stock",
    parallel
      .flatMap((s) => s.lignes)
      .reduce((n, l) => n + l.qteVendue - l.qteNonCouverte, 0),
    10,
  );
  check(
    "Concurrent uncovered demand",
    parallel.flatMap((s) => s.lignes).reduce((n, l) => n + l.qteNonCouverte, 0),
    10,
  );
  for (const s of parallel) await api("DELETE", "/ventes/" + s.id);
  check(
    "Concurrent reversal restores exact stock",
    (await stock(race)).qteDisponible,
    10,
  );
  const products = Array.from({ length: 250 }, (_, i) => ({
    id: randomUUID(),
    reference: "QA-LOAD-" + String(i).padStart(4, "0"),
    designation: "QA load product " + i,
    famille_id: family.id,
  }));
  await db.prisma.produits.createMany({ data: products });
  // Seed a representative bounded set directly; request/money correctness was tested through HTTP above.
  const lines = [];
  for (let i = 0; i < 1000; i++) {
    const id = randomUUID();
    await db.prisma.bl_achats.create({
      data: {
        id,
        date_id: Number(today.replaceAll("-", "")),
        transaction_date: new Date(today),
        bl_numero: "QA-LOAD-" + i,
        magasin_id: store.id,
        fournisseur_id: supplier.id,
      },
    });
    lines.push({
      bl_achat_id: id,
      produit_id: products[i % products.length].id,
      qte_achetee: 10,
      qte_restante: 10,
      prix_achat_net_ht: 10,
      taux_tva: 19,
      prix_achat_ttc: 11.9,
      prix_achat_total_ttc: 119,
    });
  }
  await db.prisma.bl_achat_lignes.createMany({ data: lines });
  const expectedPurchase = 119617.39,
    expectedStock = 100548.84;
  const knownDashboard = await api("GET", kpiPath);
  check(
    "Independent dashboard purchase total",
    knownDashboard.totals.totalAchat,
    expectedPurchase,
  );
  check(
    "Independent dashboard stock value",
    knownDashboard.totals.totalValeur,
    expectedStock,
  );
  check(
    "Independent dashboard sales-minus-purchases",
    knownDashboard.totals.marge,
    -expectedPurchase,
  );
  const annual = await api("GET", "/analytics/annual-report?year=" + year);
  check(
    "Independent annual purchase total",
    annual.cumulAchat,
    expectedPurchase,
  );
  check(
    "Annual stock is closing stock rather than summed months",
    annual.cumValeur,
    expectedStock,
  );
  const combined = await Promise.allSettled([
    ...Array.from({ length: 10 }, () => sell(race, 2, 3)),
    ...Array.from({ length: 20 }, () => api("GET", kpiPath)),
  ]);
  check(
    "Concurrent reads and sales have no errors",
    combined.every((r) => r.status === "fulfilled"),
    true,
  );
  const mixedSales = combined
    .slice(0, 10)
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  check(
    "Mixed read/write sales preserve exact covered demand",
    mixedSales
      .flatMap((s) => s.lignes)
      .reduce((n, l) => n + l.qteVendue - l.qteNonCouverte, 0),
    10,
  );
  for (const sale of mixedSales) await api("DELETE", "/ventes/" + sale.id);
  report.dataset = {
    products: await db.prisma.produits.count(),
    purchases: await db.prisma.bl_achats.count(),
    purchaseLines: await db.prisma.bl_achat_lignes.count(),
    sales: await db.prisma.ventes.count(),
  };
  await db.pool.query(
    "UPDATE analytics_snapshot_state SET statut='A_RECALCULER'",
  );
  const coldStart = performance.now();
  const burst = await Promise.all(
    Array.from({ length: 20 }, async () => {
      try {
        await api("GET", kpiPath);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }),
  );
  report.coldBurst = {
    concurrency: 20,
    elapsedMs: Math.round(performance.now() - coldStart),
    success: burst.filter((r) => r.ok).length,
    errors: burst.filter((r) => !r.ok),
  };
  console.log("Cold analytics burst: " + JSON.stringify(report.coldBurst));
  await api("GET", kpiPath);
  for (const concurrency of [1, 5, 10, 20])
    await stage(concurrency, "mixed-read");
  report.passed =
    report.checks.every((c) => c.pass) &&
    report.coldBurst.errors.length === 0 &&
    report.stages.every((s) =>
      Object.keys(s.statuses).every((k) => k === "200"),
    );
} catch (error) {
  report.fatal = error.message;
  report.passed = false;
  console.error(error.message);
} finally {
  try {
    if (app) await app.close();
    if (db) await db.closeDb();
    if (created) {
      if (!/^apms_qa_[0-9a-f]{16}$/.test(dbName))
        throw Error("Unsafe scratch database name");
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
        [dbName],
      );
      await admin.query("DROP DATABASE " + dbName);
      report.cleanedUp = true;
    }
  } finally {
    await admin.end();
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  }
}
console.log(
  "QA report: " +
    path.relative(root, reportPath) +
    "; passed=" +
    report.passed +
    "; scratch database removed=" +
    report.cleanedUp,
);
if (!report.passed) process.exitCode = 1;
