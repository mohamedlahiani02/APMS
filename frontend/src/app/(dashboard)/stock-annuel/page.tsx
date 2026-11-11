'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { ClientTable } from '@/components/shared/DataTable';
import ApiErrorBanner from '@/components/shared/ApiErrorBanner';
import Button from '@/components/ui/Button';
import { formatDinar } from '@/utils';

interface FiscalYear { annee: number; mode: 'LEGACY' | 'CARRY' | 'MANUAL'; statut: 'OPEN' | 'CLOSED'; needs_review: boolean }
interface OpeningRow { produitId: string; magasinId: string; reference: string; designation: string; magasin: string; quantite: number; coutUnitaire: number; deficit?: number }
const key = (row: OpeningRow) => row.produitId + ':' + row.magasinId;
export default function AnnualStockPage() {
  const current = Number(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Tunis', year: 'numeric' }).format(new Date()));
  const [year, setYear] = useState(current);
  const [selectedMode, setSelectedMode] = useState<'CARRY' | 'MANUAL' | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const qc = useQueryClient();
  const years = useQuery({ queryKey: ['stock-years'], queryFn: async () => (await apiClient.get<FiscalYear[]>('/stock-years')).data });
  const state = years.data?.find(row => row.annee === year);
  const mode = selectedMode ?? (state?.mode === 'MANUAL' ? 'MANUAL' : 'CARRY');
  const previous = years.data?.find(row => row.annee === year - 1);
  const closing = useQuery({ queryKey: ['annual-closing', year], queryFn: async () => (await apiClient.get<OpeningRow[]>('/stock-years/' + year + '/closing')).data, enabled: !!state && !state.needs_review });
  const opening = useQuery({ queryKey: ['annual-opening', year], queryFn: async () => (await apiClient.get<{ lignes: OpeningRow[] }>('/stock-years/' + year + '/opening')).data, enabled: !!state });
  const baseline = useQuery({ queryKey: ['annual-closing', year - 1], queryFn: async () => (await apiClient.get<OpeningRow[]>('/stock-years/' + (year - 1) + '/closing')).data, enabled: !!previous && !previous.needs_review });
  const rows = (baseline.data ?? []).map(row => ({ ...row, quantite: mode === 'CARRY' ? row.quantite : Number(quantities[key(row)] ?? opening.data?.lignes.find(o => key(o) === key(row))?.quantite ?? row.quantite) }));
  const mutation = useMutation({
    mutationFn: async (action: 'opening' | 'close' | 'reopen') => {
      if (action === 'opening') {
        if (rows.some(row => !Number.isFinite(row.quantite) || row.quantite < 0)) throw new Error('Quantités invalides.');
        return apiClient.put('/stock-years/' + year + '/opening', { mode, lignes: mode === 'MANUAL' ? rows.map(row => ({ produitId: row.produitId, magasinId: row.magasinId, quantite: row.quantite })) : undefined });
      }
      return apiClient.post('/stock-years/' + year + '/' + action);
    },
    onSuccess: () => { void qc.invalidateQueries(); setNotice('Opération enregistrée et tracée dans le journal d’audit.'); },
  });
  const act = (action: 'opening' | 'close' | 'reopen') => {
    const message = action === 'opening' ? 'Valider cette ouverture ? Les ventes existantes de cette année seront réaffectées au stock disponible.' : action === 'close' ? 'Clôturer cette année et bloquer ses achats et ventes ?' : 'Réouvrir cette année ? Les ouvertures des années suivantes devront être revalidées.';
    if (window.confirm(message)) { setNotice(''); mutation.mutate(action); }
  };
  const options = Array.from(new Set([...(years.data?.map(r => r.annee) ?? []), current, current + 1])).sort((a, b) => b - a);
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold">Stock annuel</h1><p className="mt-1 text-sm text-gray-600">Clôturez une année, puis choisissez la reprise ou la saisie des quantités d’ouverture. Les coûts HT proviennent de la clôture précédente.</p></div>
    <label className="flex items-center gap-3 text-sm">Année<select aria-label="Année de stock" className="rounded-md border bg-white px-3 py-2" value={year} onChange={event => { setYear(Number(event.target.value)); setSelectedMode(null); setQuantities({}); setNotice(''); mutation.reset(); }}>{options.map(y => <option key={y}>{y}</option>)}</select></label>
    <ApiErrorBanner error={years.error || closing.error || opening.error || baseline.error || mutation.error} />
    {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><div><p className="font-semibold">{state ? state.statut === 'CLOSED' ? 'Année clôturée' : 'Année ouverte' : 'Ouverture à préparer'}</p>{state?.needs_review && <p role="alert" className="mt-1 text-sm text-amber-800">Ouverture à revalider après une correction d’année précédente. Les écritures sont bloquées.</p>}</div><div className="flex gap-2">
      {state?.statut === 'OPEN' && <Button variant="secondary" disabled={year >= current || state.needs_review || mutation.isPending} onClick={() => act('close')}>Clôturer {year}</Button>}
      {state?.statut === 'CLOSED' && <Button variant="secondary" loading={mutation.isPending} onClick={() => act('reopen')}>Réouvrir {year}</Button>}
    </div></div>
    {state && year >= current && state.statut === 'OPEN' && <p className="text-sm text-gray-500">La clôture définitive sera disponible après le 31 décembre {year}.</p>}
    {previous && state?.mode !== 'LEGACY' && state?.statut !== 'CLOSED' && <section className="space-y-4 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-semibold">Ouverture au 1er janvier {year}</h2>
      <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">Méthode d’ouverture</legend><label className="flex items-center gap-2 text-sm"><input type="radio" name="opening-mode" checked={mode === 'CARRY'} onChange={() => setSelectedMode('CARRY')} />Reprendre les quantités de clôture</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="opening-mode" checked={mode === 'MANUAL'} onChange={() => setSelectedMode('MANUAL')} />Saisir les quantités</label></fieldset>
      <p className="text-sm text-gray-500">Le coût unitaire HT n’est pas modifiable. Un produit sans coût de clôture connu ne peut pas recevoir de quantité d’ouverture.</p>
      {previous.statut !== 'CLOSED' && <p className="text-sm text-amber-800">Clôturez d’abord {year - 1}. Les valeurs ci-dessous sont une prévisualisation.</p>}
      <ClientTable label="Préparation du stock d’ouverture" rows={rows} rowKey={key} searchText={r => r.reference + ' ' + r.designation + ' ' + r.magasin} columns={[
        { key: 'reference', label: 'Référence', render: r => r.reference, sortValue: r => r.reference },
        { key: 'designation', label: 'Produit', render: r => r.designation },
        { key: 'magasin', label: 'Magasin', render: r => r.magasin, sortValue: r => r.magasin },
        { key: 'quantite', label: 'Quantité d’ouverture', numeric: true, sortValue: r => r.quantite, render: r => mode === 'CARRY' ? r.quantite : <input aria-label={'Quantité ' + r.reference + ' — ' + r.magasin} type="number" min="0" max="999999999.999" step="0.001" value={quantities[key(r)] ?? r.quantite} onChange={event => setQuantities(values => ({ ...values, [key(r)]: event.target.value }))} className="w-28 rounded-md border px-2 py-1 text-right" /> },
        { key: 'cout', label: 'Coût unitaire HT', numeric: true, render: r => formatDinar(r.coutUnitaire), sortValue: r => r.coutUnitaire },
      ]} />
      <Button loading={mutation.isPending} disabled={previous.statut !== 'CLOSED' || previous.needs_review || baseline.isPending || baseline.isError} onClick={() => act('opening')}>Valider l’ouverture {year}</Button>
    </section>}
    {opening.data && state?.mode !== 'LEGACY' && <ClientTable label="Stock d’ouverture enregistré" rows={opening.data.lignes} rowKey={key} searchText={r => r.reference + ' ' + r.designation + ' ' + r.magasin} columns={[
      { key: 'reference', label: 'Référence', render: r => r.reference, sortValue: r => r.reference },{ key: 'produit', label: 'Produit', render: r => r.designation },{ key: 'magasin', label: 'Magasin', render: r => r.magasin },{ key: 'quantite', label: 'Quantité d’ouverture', numeric: true, render: r => r.quantite, sortValue: r => r.quantite },{ key: 'cout', label: 'Coût unitaire HT', numeric: true, render: r => formatDinar(r.coutUnitaire), sortValue: r => r.coutUnitaire },
    ]} />}
    {state && !state.needs_review && <ClientTable label="Prévisualisation du stock de clôture" rows={closing.data ?? []} rowKey={key} searchText={r => r.reference + ' ' + r.designation + ' ' + r.magasin} columns={[
      { key: 'reference', label: 'Référence', render: r => r.reference, sortValue: r => r.reference },{ key: 'produit', label: 'Produit', render: r => r.designation },{ key: 'magasin', label: 'Magasin', render: r => r.magasin },{ key: 'quantite', label: 'Quantité de clôture', numeric: true, render: r => r.quantite, sortValue: r => r.quantite },{ key: 'cout', label: 'Coût unitaire HT', numeric: true, render: r => formatDinar(r.coutUnitaire), sortValue: r => r.coutUnitaire },{ key: 'deficit', label: 'Déficit', numeric: true, render: r => r.deficit ?? 0 },
    ]} />}
  </div>;
}
