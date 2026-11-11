import ExcelJS from 'exceljs';
import { z } from 'zod';
export const tableExportSchema = z.object({
  title: z.string().trim().min(1).max(150),
  columns: z.array(z.string().max(200)).min(1).max(60),
  rows: z.array(z.array(z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()])).max(60)).max(50000),
}).refine(value => value.rows.every(row => row.length === value.columns.length), 'Colonnes incohérentes.');
export async function buildTableWorkbook(input: z.infer<typeof tableExportSchema>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tableau filtré');
  sheet.addRow(input.columns);
  input.rows.forEach(row => sheet.addRow(row)); // Strings remain literal cells, never formulas.
  sheet.columns.forEach(column => { column.width = 24; });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: input.columns.length } };
  workbook.title = input.title;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
