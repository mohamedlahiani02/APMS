import apiClient from '@/lib/api/client';
import type { Famille, LookupItem } from '@/types';
import type { Page, PageQuery } from '@/types/api';
import type { FamilleInput } from '@/lib/validations';

export async function listFamilles(params: PageQuery = {}): Promise<Page<Famille>> {
  const res = await apiClient.get<Page<Famille>>('/familles', { params });
  return res.data;
}

export async function lookupFamilles(q?: string, limit?: number): Promise<LookupItem[]> {
  const res = await apiClient.get<LookupItem[]>('/familles/lookup', { params: { q, limit } });
  return res.data;
}

export async function getFamille(id: string): Promise<Famille> {
  const res = await apiClient.get<Famille>(`/familles/${id}`);
  return res.data;
}

export async function createFamille(data: FamilleInput): Promise<Famille> {
  const res = await apiClient.post<Famille>('/familles', data);
  return res.data;
}

export async function updateFamille(id: string, data: Omit<FamilleInput, 'code'>): Promise<Famille> {
  const res = await apiClient.put<Famille>(`/familles/${id}`, data);
  return res.data;
}

export async function deleteFamille(id: string): Promise<void> {
  await apiClient.delete(`/familles/${id}`);
}
