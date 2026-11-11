import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClientTable } from '@/components/shared/DataTable';
import { collectAllPages, downloadTable } from './table-export';
vi.mock('./table-export', async original => ({ ...await original<typeof import('./table-export')>(), downloadTable: vi.fn(async () => {}) }));
describe('filtered exports', () => {
  it('exports filtered client rows beyond the page, preserving sort and action data', async () => {
    const rows = Array.from({ length: 25 }, (_, id) => ({ id: String(id), label: id < 20 ? 'Garder' : 'Autre', amount: 25 - id }));
    render(<ClientTable label="Test" rows={rows} rowKey={r => r.id} searchText={r => r.label} columns={[{ key: 'label', label: 'Produit', render: r => r.label }, { key: 'amount', label: 'Quantité', numeric: true, sortValue: r => r.amount, render: r => r.amount }, { key: 'action', label: 'Action', render: () => 'UPDATE' }, { key: 'actions', label: 'Actions', render: () => <button>Modifier</button> }]} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher dans Test' }), { target: { value: 'Garder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exporter Excel' }));
    await waitFor(() => expect(downloadTable).toHaveBeenCalled());
    const [title, headers, data] = vi.mocked(downloadTable).mock.calls.at(-1)!;
    expect(title).toBe('Test'); expect(headers).toEqual(['Produit', 'Quantité', 'Action']); expect(data).toHaveLength(20);
    expect(data[0]).toEqual(['Garder', 6, 'UPDATE']); expect(data.at(-1)).toEqual(['Garder', 25, 'UPDATE']);
  });
  it('fetches every server page and rejects changing result counts', async () => {
    const fetch = vi.fn(async (page: number, size: number) => ({ content: Array.from({ length: page === 0 ? 200 : 5 }, (_, i) => ({ id: page * size + i })), page: { page, size, totalElements: 205, totalPages: 2 } }));
    expect(await collectAllPages(fetch)).toHaveLength(205); expect(fetch.mock.calls).toEqual([[0, 200], [1, 200]]);
    const changed = vi.fn(async (page: number, size: number) => ({ content: [{ id: page }], page: { page, size, totalElements: page === 0 ? 2 : 3, totalPages: 2 } }));
    await expect(collectAllPages(changed)).rejects.toThrow('changé');
  });
});
