import apiClient from '@/lib/api/client';
import type { Fournisseur, LookupItem } from '@/types';
import type { Page, PageQuery } from '@/types/api';
import type { FournisseurInput } from '@/lib/validations';

export async function listFournisseurs(params: PageQuery = {}): Promise<Page<Fournisseur>> {
  const res = await apiClient.get<Page<Fournisseur>>('/fournisseurs', { params });
  return res.data;
}

export async function lookupFournisseurs(q?: string, limit?: number): Promise<LookupItem[]> {
  const res = await apiClient.get<LookupItem[]>('/fournisseurs/lookup', { params: { q, limit } });
  return res.data;
}

export async function getFournisseur(id: string): Promise<Fournisseur> {
  const res = await apiClient.get<Fournisseur>(`/fournisseurs/${id}`);
  return res.data;
}

export async function createFournisseur(data: FournisseurInput): Promise<Fournisseur> {
  const res = await apiClient.post<Fournisseur>('/fournisseurs', data);
  return res.data;
}

export async function updateFournisseur(
  id: string,
  data: Omit<FournisseurInput, 'code'>
): Promise<Fournisseur> {
  const res = await apiClient.put<Fournisseur>(`/fournisseurs/${id}`, data);
  return res.data;
}

export async function deleteFournisseur(id: string): Promise<void> {
  await apiClient.delete(`/fournisseurs/${id}`);
}
