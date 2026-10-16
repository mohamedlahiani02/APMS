import apiClient from '@/lib/api/client';
import type { LookupItem, Magasin } from '@/types';
import type { Page, PageQuery } from '@/types/api';
import type { MagasinInput } from '@/lib/validations';

export async function listMagasins(params: PageQuery = {}): Promise<Page<Magasin>> {
  const res = await apiClient.get<Page<Magasin>>('/magasins', { params });
  return res.data;
}

export async function lookupMagasins(q?: string, limit?: number): Promise<LookupItem[]> {
  const res = await apiClient.get<LookupItem[]>('/magasins/lookup', { params: { q, limit } });
  return res.data;
}

export async function getMagasin(id: string): Promise<Magasin> {
  const res = await apiClient.get<Magasin>(`/magasins/${id}`);
  return res.data;
}

export async function createMagasin(data: MagasinInput): Promise<Magasin> {
  const res = await apiClient.post<Magasin>('/magasins', data);
  return res.data;
}

export async function updateMagasin(id: string, data: Omit<MagasinInput, 'code'>): Promise<Magasin> {
  const res = await apiClient.put<Magasin>(`/magasins/${id}`, data);
  return res.data;
}

export async function deleteMagasin(id: string): Promise<void> {
  await apiClient.delete(`/magasins/${id}`);
}
