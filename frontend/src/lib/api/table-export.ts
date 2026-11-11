import apiClient from './client';
import type { Page } from '@/types/api';
export async function collectAllPages<T>(fetchPage: (page: number, size: number) => Promise<Page<T>>) {
  const rows: T[] = []; let expected: number | undefined;
  for (let page = 0; ; page++) {
    const result = await fetchPage(page, 200);
    expected ??= result.page.totalElements;
    if (expected > 50000) throw new Error('L’export est limité à 50 000 lignes. Précisez les filtres.');
    if (result.page.totalElements !== expected) throw new Error('Les données ont changé pendant l’export. Réessayez.');
    rows.push(...result.content);
    if (rows.length === expected) return rows;
    if (!result.content.length || rows.length > expected) throw new Error('Les données ont changé pendant l’export. Réessayez.');
  }
}
export async function downloadTable(title: string, columns: string[], rows: (string | number | boolean | null)[][]) {
  if (rows.length > 50000) throw new Error('L’export est limité à 50 000 lignes. Précisez les filtres.');
  const response = await apiClient.post('/tables/export/excel', { title, columns, rows }, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a'); link.href = url;
  link.download = title.replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '-').slice(0, 100) + '.xlsx';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
