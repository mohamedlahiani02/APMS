import apiClient from "@/lib/api/client";
import type {
  BlAchat,
  BlAchatLookupItem,
  CreateBlAchatRequest,
  UpdateBlAchatRequest,
} from "@/types";
import type { Page, PageQuery } from "@/types/api";

export interface BlAchatListQuery extends PageQuery {
  magasinId?: string;
  consumed?: "yes" | "no";
  fournisseurId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listBlAchats(
  params: BlAchatListQuery = {},
): Promise<Page<BlAchat>> {
  const res = await apiClient.get<Page<BlAchat>>("/bl-achats", { params });
  return res.data;
}

export async function lookupBlAchats(
  q?: string,
  limit?: number,
): Promise<BlAchatLookupItem[]> {
  const res = await apiClient.get<BlAchatLookupItem[]>("/bl-achats/lookup", {
    params: { q, limit },
  });
  return res.data;
}

export async function getBlAchat(id: string): Promise<BlAchat> {
  const res = await apiClient.get<BlAchat>(`/bl-achats/${id}`);
  return res.data;
}

export async function createBlAchat(
  data: CreateBlAchatRequest,
): Promise<BlAchat> {
  const res = await apiClient.post<BlAchat>("/bl-achats", data);
  return res.data;
}

export async function updateBlAchat(
  id: string,
  data: UpdateBlAchatRequest,
): Promise<BlAchat> {
  const res = await apiClient.put<BlAchat>(`/bl-achats/${id}`, data);
  return res.data;
}

export async function deleteBlAchat(id: string): Promise<void> {
  await apiClient.delete(`/bl-achats/${id}`);
}
