import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildTableWorkbook, tableExportSchema } from './table.js';
describe('filtered table workbook', () => {
  it('preserves ordered numeric and literal text cells without extra rows', async () => {
    const value = { title: 'Stock filtré', columns: ['Produit', 'Quantité'], rows: [['=1+2', 12], ['A & B', 3]] };
    const bytes = await buildTableWorkbook(tableExportSchema.parse(value));
    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error exceljs Buffer typings differ from Node Buffer
    await workbook.xlsx.load(bytes);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getCell('A2').value).toBe('=1+2');
    expect(sheet.getCell('A2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('B2').value).toBe(12);
    expect(sheet.getCell('A3').value).toBe('A & B');
    expect(tableExportSchema.safeParse({ ...value, rows: [[1]] }).success).toBe(false);
  });
});
