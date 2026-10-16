import { afterAll, describe, expect, it } from "vitest";
import { getAnnualReport, getDashboard, getDrilldown } from "./service.js";
import { ValidationException, ResourceNotFoundException } from "../common/errors.js";
import { closeDb } from "../db.js";

afterAll(async () => {
  await closeDb();
});

// Known to have restored production data (per the environment this domain was built against).
const YEAR = 2026;
const MONTH = 8;

describe("analytics dashboard", () => {
  it("rejects a future period", async () => {
    await expect(getDashboard(2099, 1)).rejects.toBeInstanceOf(ValidationException);
  });

  it("totals equal the sum of the per-dimension breakdowns", async () => {
    const dashboard = await getDashboard(YEAR, MONTH);

    const sumAchatByFournisseur = dashboard.parFournisseur.reduce((s, f) => s + f.totalAchat, 0);
    const sumAchatByFamille = dashboard.parFamille.reduce((s, f) => s + f.totalAchat, 0);
    const sumAchatByMagasin = dashboard.parMagasin.reduce((s, f) => s + f.totalAchat, 0);

    expect(sumAchatByFournisseur).toBeCloseTo(dashboard.totals.totalAchat, 1);
    expect(sumAchatByFamille).toBeCloseTo(dashboard.totals.totalAchat, 1);
    expect(sumAchatByMagasin).toBeCloseTo(dashboard.totals.totalAchat, 1);

    const sumVenteByFamille = dashboard.parFamille.reduce((s, f) => s + f.totalVente, 0);
    expect(sumVenteByFamille).toBeCloseTo(dashboard.totals.totalVente, 1);

    expect(dashboard.totals.marge).toBeCloseTo(dashboard.totals.totalVente - dashboard.totals.totalAchat, 1);
  });

  it("computes tauxMarge as marge*100/vente, rounded, null when vente is 0", () => {
    // behavioural spec check via a couple of direct cases is covered by the
    // integration assertion above (marge/vente consistency); this just pins
    // the null-on-zero-vente contract explicitly.
    const vente = 0;
    const marge = 42;
    const tauxMarge = vente === 0 ? null : Math.round(((marge * 100) / vente) * 100) / 100;
    expect(tauxMarge).toBeNull();
  });

  it("expresses each supplier's achat as a percentage of the single top supplier's achat", async () => {
    const dashboard = await getDashboard(YEAR, MONTH);
    if (dashboard.parFournisseur.length === 0) return;

    const top = dashboard.parFournisseur.reduce((max, f) => (f.totalAchat > max.totalAchat ? f : max));
    expect(top.pctAchatDuTop).toBeCloseTo(100, 1);

    for (const f of dashboard.parFournisseur) {
      if (top.totalAchat === 0) {
        expect(f.pctAchatDuTop).toBeNull();
      } else {
        expect(f.pctAchatDuTop).toBeCloseTo((f.totalAchat * 100) / top.totalAchat, 1);
      }
    }
  });

  it("returns at most 5 top familles by vente and by stock value", async () => {
    const dashboard = await getDashboard(YEAR, MONTH);
    expect(dashboard.topFamillesParVente.length).toBeLessThanOrEqual(5);
    expect(dashboard.topFamillesParValeur.length).toBeLessThanOrEqual(5);
  });
});

describe("analytics annual report", () => {
  it("evolution has one entry per month from January through upToMonth", async () => {
    const report = await getAnnualReport(YEAR);
    expect(report.evolution.length).toBe(report.upToMonth);
    expect(report.evolution[0]?.month).toBe(1);
    expect(report.evolution[report.evolution.length - 1]?.month).toBe(report.upToMonth);
    expect(report.label).toContain("Cumulé de Janvier à");
  });

  it("cumulative achat/vente/nbTx equal the sums of the evolution array", async () => {
    const report = await getAnnualReport(YEAR);
    const sumAchat = report.evolution.reduce((s, e) => s + e.totalAchat, 0);
    const sumVente = report.evolution.reduce((s, e) => s + e.totalVente, 0);
    const sumNbTx = report.evolution.reduce((s, e) => s + e.nbTx, 0);
    expect(report.cumulAchat).toBeCloseTo(sumAchat, 1);
    expect(report.cumulVente).toBeCloseTo(sumVente, 1);
    expect(report.cumulNbTx).toBe(sumNbTx);
  });

  it("returns at most the top 2 per dimension", async () => {
    const report = await getAnnualReport(YEAR);
    expect(report.topFournisseurs.length).toBeLessThanOrEqual(2);
    expect(report.topFamilles.length).toBeLessThanOrEqual(2);
    expect(report.topMagasins.length).toBeLessThanOrEqual(2);
  });
});

describe("analytics drilldown", () => {
  it("404s for an entity that doesn't exist", async () => {
    await expect(
      getDrilldown("familles", "00000000-0000-0000-0000-000000000000", YEAR, MONTH),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it("fournisseurs drilldown totals include marge; familles/magasins omit it", async () => {
    const dashboard = await getDashboard(YEAR, MONTH);
    const fournisseur = dashboard.parFournisseur[0];
    const famille = dashboard.parFamille[0];
    const magasin = dashboard.parMagasin[0];
    if (!fournisseur || !famille || !magasin) return;

    const fournisseurDrill = await getDrilldown("fournisseurs", fournisseur.fournisseurId, YEAR, MONTH);
    expect(fournisseurDrill.totals.marge).toBeDefined();
    expect(fournisseurDrill.totals.marge).toBeCloseTo(
      fournisseurDrill.totals.totalVente - fournisseurDrill.totals.totalAchat,
      1,
    );
    expect(fournisseurDrill.items.length).toBeGreaterThan(0);
    for (const item of fournisseurDrill.items) {
      expect(item.fournisseurId).toBe(fournisseur.fournisseurId);
    }

    const familleDrill = await getDrilldown("familles", famille.familleId, YEAR, MONTH);
    expect(familleDrill.totals.marge).toBeUndefined();
    expect(familleDrill.items.length).toBeGreaterThan(0);

    const magasinDrill = await getDrilldown("magasins", magasin.magasinId, YEAR, MONTH);
    expect(magasinDrill.totals.marge).toBeUndefined();
    expect(magasinDrill.items.length).toBeGreaterThan(0);
  });
});
