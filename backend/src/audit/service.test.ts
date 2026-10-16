import { afterAll, describe, expect, it } from "vitest";
import { getEntityHistory, listAuditLogs } from "./service.js";
import { closeDb } from "../db.js";

afterAll(async () => {
  await closeDb();
});

describe("audit service (live DB, read-only)", () => {
  it("lists audit logs newest first, paged", async () => {
    const page = await listAuditLogs({ page: 0, size: 10 });
    expect(page.content.length).toBeLessThanOrEqual(10);
    expect(page.page.totalElements).toBeGreaterThanOrEqual(page.content.length);

    for (let i = 1; i < page.content.length; i++) {
      const prev = new Date(page.content[i - 1]!.timestamp).getTime();
      const curr = new Date(page.content[i]!.timestamp).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it("filters by entityType", async () => {
    const page = await listAuditLogs({ page: 0, size: 1 });
    const sample = page.content[0];
    if (!sample) return;

    const filtered = await listAuditLogs({ page: 0, size: 50, entityType: sample.entityType });
    expect(filtered.content.length).toBeGreaterThan(0);
    for (const item of filtered.content) {
      expect(item.entityType).toBe(sample.entityType);
    }
  });

  it("returns full unpaged history for one entity", async () => {
    const page = await listAuditLogs({ page: 0, size: 1 });
    const sample = page.content[0];
    if (!sample || !sample.entityId) return;

    const history = await getEntityHistory(sample.entityType, sample.entityId);
    expect(history.length).toBeGreaterThan(0);
    for (const item of history) {
      expect(item.entityType).toBe(sample.entityType);
      expect(item.entityId).toBe(sample.entityId);
    }
  });
});
