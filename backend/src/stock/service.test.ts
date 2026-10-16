import { afterAll, describe, expect, it } from "vitest";
import { listStock, lookupLegacyLots } from "./service.js";
import { closeDb } from "../db.js";

afterAll(async () => {
  await closeDb();
});

describe("stock service (live DB, read-only)", () => {
  it("lists stock with non-negative quantities and respects page size", async () => {
    const { content, total } = await listStock({ page: 0, size: 10 });
    expect(total).toBeGreaterThanOrEqual(0);
    expect(content.length).toBeLessThanOrEqual(10);
    for (const item of content) {
      expect(item.qteDisponible).toBeGreaterThanOrEqual(0);
      expect(item.valeur).toBeGreaterThanOrEqual(0);
      expect(item.produitId).toBeTruthy();
      expect(item.magasinId).toBeTruthy();
    }
  });

  it("filters by magasinId", async () => {
    const page = await listStock({ page: 0, size: 5 });
    const sample = page.content[0];
    if (!sample) return; // no data to assert against in this environment
    const filtered = await listStock({ page: 0, size: 50, magasinId: sample.magasinId });
    expect(filtered.content.length).toBeGreaterThan(0);
    for (const item of filtered.content) {
      expect(item.magasinId).toBe(sample.magasinId);
    }
  });

  it("filters by search against produit reference/designation", async () => {
    const page = await listStock({ page: 0, size: 5 });
    const sample = page.content[0];
    if (!sample) return;
    const searchTerm = sample.produitReference.slice(0, 3);
    const filtered = await listStock({ page: 0, size: 50, search: searchTerm });
    expect(filtered.content.length).toBeGreaterThan(0);
    for (const item of filtered.content) {
      const haystack = `${item.produitReference} ${item.produitDesignation}`.toLowerCase();
      expect(haystack).toContain(searchTerm.toLowerCase());
    }
  });

  it("looks up legacy lots", async () => {
    const results = await lookupLegacyLots({ limit: 10 });
    expect(Array.isArray(results)).toBe(true);
    for (const item of results) {
      expect(item.id).toBeTruthy();
      expect(item.produitLabel).toContain(" - ");
      expect(item.qteDisponible).toBeTypeOf("number");
    }
  });
});
