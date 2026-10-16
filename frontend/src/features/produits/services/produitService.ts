import apiClient from '@/lib/api/client';
import type { Produit, ProduitLookupItem } from '@/types';
import type { Page, PageQuery } from '@/types/api';
import type { ProduitInput } from '@/lib/validations';

export interface ProduitListQuery extends PageQuery {
  familleId?: string;
}

export async function listProduits(params: ProduitListQuery = {}): Promise<Page<Produit>> {
  const res = await apiClient.get<Page<Produit>>('/produits', { params });
  return res.data;
}

export async function lookupProduits(q?: string, limit?: number): Promise<ProduitLookupItem[]> {
  const res = await apiClient.get<ProduitLookupItem[]>('/produits/lookup', { params: { q, limit } });
  return res.data;
}

export async function getProduit(id: string): Promise<Produit> {
  const res = await apiClient.get<Produit>(`/produits/${id}`);
  return res.data;
}

export async function createProduit(data: ProduitInput): Promise<Produit> {
  const res = await apiClient.post<Produit>('/produits', data);
  return res.data;
}

export async function updateProduit(id: string, data: Omit<ProduitInput, 'reference'>): Promise<Produit> {
  const res = await apiClient.put<Produit>(`/produits/${id}`, data);
  return res.data;
}

export async function deleteProduit(id: string): Promise<void> {
  await apiClient.delete(`/produits/${id}`);
}
