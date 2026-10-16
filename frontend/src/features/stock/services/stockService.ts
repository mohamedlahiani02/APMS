import apiClient from "@/lib/api/client";
import type { StockItem, StockLegacyLotLookupItem } from "@/types";
import type { Page, PageQuery } from "@/types/api";

export interface StockListQuery extends PageQuery {
  magasinId?: string;
  availability?: "positive" | "zero";
}

export async function listStock(
  params: StockListQuery = {},
): Promise<Page<StockItem>> {
  const res = await apiClient.get<Page<StockItem>>("/stock", { params });
  return res.data;
}

export async function lookupLegacyLots(
  q?: string,
  limit?: number,
): Promise<StockLegacyLotLookupItem[]> {
  const res = await apiClient.get<StockLegacyLotLookupItem[]>(
    "/stock/legacy-lots/lookup",
    {
      params: { q, limit },
    },
  );
  return res.data;
}
