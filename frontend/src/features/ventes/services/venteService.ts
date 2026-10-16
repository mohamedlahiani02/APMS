import apiClient from "@/lib/api/client";
import type { CreateVenteRequest, Vente } from "@/types";
import type { Page, PageQuery } from "@/types/api";

export interface VenteListQuery extends PageQuery {
  magasinId?: string;
  hasDepassement?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export async function listVentes(
  params: VenteListQuery = {},
): Promise<Page<Vente>> {
  const res = await apiClient.get<Page<Vente>>("/ventes", { params });
  return res.data;
}

export async function getVente(id: string): Promise<Vente> {
  const res = await apiClient.get<Vente>(`/ventes/${id}`);
  return res.data;
}

export async function createVente(data: CreateVenteRequest): Promise<Vente> {
  const res = await apiClient.post<Vente>("/ventes", data);
  return res.data;
}

export async function updateVente(
  id: string,
  data: CreateVenteRequest,
): Promise<Vente> {
  const res = await apiClient.put<Vente>(`/ventes/${id}`, data);
  return res.data;
}

export async function deleteVente(id: string): Promise<void> {
  await apiClient.delete(`/ventes/${id}`);
}
