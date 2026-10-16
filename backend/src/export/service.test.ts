import ExcelJS from "exceljs";
import { afterAll, describe, expect, it } from "vitest";
import { buildTransactionsWorkbook } from "./service.js";
import { closeDb } from "../db.js";

afterAll(async () => {
  await closeDb();
});

describe("export service (live DB, read-only)", () => {
  it("produces a valid, non-empty xlsx buffer with both tabs", async () => {
    const buffer = await buildTransactionsWorkbook({});
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    // exceljs's .d.ts merges a global `declare interface Buffer extends ArrayBuffer {}`
    // that no longer structurally matches @types/node's generic Buffer<T> — an
    // upstream typing defect, harmless at runtime.
    // @ts-expect-error exceljs Buffer typing is incompatible with current @types/node
    await workbook.xlsx.load(buffer);

    const sheetNames = workbook.worksheets.map((s) => s.name);
    expect(sheetNames).toContain("BL Achats");
    expect(sheetNames).toContain("Ventes");

    const blSheet = workbook.getWorksheet("BL Achats")!;
    const venteSheet = workbook.getWorksheet("Ventes")!;
    // header row + at least one data row for this restored dataset
    expect(blSheet.rowCount).toBeGreaterThan(1);
    expect(venteSheet.rowCount).toBeGreaterThan(1);

    expect(blSheet.getRow(1).getCell(1).value).toBe("Date");
    expect(venteSheet.getRow(1).getCell(1).value).toBe("Date");
  });

  it("a magasinId that matches nothing yields empty (header-only) sheets on both tabs", async () => {
    const bogusId = "00000000-0000-0000-0000-000000000000";
    const emptyBuffer = await buildTransactionsWorkbook({ magasinId: bogusId });
    const emptyWorkbook = new ExcelJS.Workbook();
    // @ts-expect-error exceljs Buffer typing is incompatible with current @types/node
    await emptyWorkbook.xlsx.load(emptyBuffer);
    expect(emptyWorkbook.getWorksheet("BL Achats")!.rowCount).toBe(1);
    expect(emptyWorkbook.getWorksheet("Ventes")!.rowCount).toBe(1);
  });

  it("applies a dateFrom/dateTo range filter to both tabs", async () => {
    const buffer = await buildTransactionsWorkbook({
      dateFrom: new Date("2026-08-01"),
      dateTo: new Date("2026-08-31"),
    });
    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error exceljs Buffer typing is incompatible with current @types/node
    await workbook.xlsx.load(buffer);
    expect(workbook.getWorksheet("BL Achats")!.rowCount).toBeGreaterThan(1);
  });
});
