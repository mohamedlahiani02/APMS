import apiClient from "@/lib/api/client";
import { downloadBlob } from "@/utils/download";

export interface ExportExcelQuery {
  magasinId?: string;
  type?: "achats" | "ventes";
  search?: string;
  fournisseurId?: string;
  consumed?: "yes" | "no";
  hasDepassement?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

/** Combined BL-achats + ventes workbook (two tabs), per API_CONTRACT.md "Export" section. */
export async function exportExcel(
  params: ExportExcelQuery = {},
): Promise<void> {
  const res = await apiClient.get("/transactions/export/excel", {
    params,
    responseType: "blob",
  });
  downloadBlob(res, "transactions.xlsx");
}
