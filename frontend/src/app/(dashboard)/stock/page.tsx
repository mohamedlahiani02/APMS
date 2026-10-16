'use client';
import { useState, useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listStock } from '@/features/stock/services/stockService';
import { lookupMagasins } from '@/features/magasins/services/magasinService';
import { formatDinar } from '@/utils';
import SearchSelect from '@/components/ui/SearchSelect';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ApiErrorBanner from '@/components/shared/ApiErrorBanner';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function StockPage() {
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [magasinId, setMagasinId] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(term);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);
  const { data, error, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['stock', page, search, magasinId],
    queryFn: () =>
      listStock({
        page,
        size: 20,
        search: search || undefined,
        magasinId: magasinId || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Stock disponible</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quantités actuelles par produit et magasin. Valorisation au coût de
          chaque lot, en HT.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          aria-label="Rechercher un produit"
          placeholder="Référence ou désignation..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <SearchSelect
          queryKey="magasins"
          value={magasinId}
          onChange={(id) => {
            setMagasinId(id);
            setPage(0);
          }}
          onSearch={lookupMagasins}
          getId={(r) => r.id}
          getLabel={(r) => r.label}
          placeholder="Tous les magasins"
        />
        <Button
          variant="secondary"
          onClick={() => {
            setMagasinId('');
            setTerm('');
            setSearch('');
            setPage(0);
          }}
        >
          Réinitialiser
        </Button>
      </div>
      <ApiErrorBanner error={error} />
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  'Référence',
                  'Désignation',
                  'Magasin',
                  'Quantité disponible',
                  'Valeur HT',
                ].map((t) => (
                  <th key={t} className="text-left p-4">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.content.map((r) => (
                <tr key={r.produitId + r.magasinId} className="border-t">
                  <td className="p-4 font-medium">{r.produitReference}</td>
                  <td className="p-4">{r.produitDesignation}</td>
                  <td className="p-4">{r.magasinNom}</td>
                  <td className="p-4">
                    {r.qteDisponible.toLocaleString('fr-TN')}
                  </td>
                  <td className="p-4">{formatDinar(r.valeur)}</td>
                </tr>
              ))}
              {data?.content.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    Aucun stock trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{data?.page.totalElements ?? 0} résultats</span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={page === 0 || isPlaceholderData}
            onClick={() => setPage((p) => p - 1)}
          >
            Précédent
          </Button>
          <span className="p-2">
            {page + 1} / {Math.max(data?.page.totalPages ?? 1, 1)}
          </span>
          <Button
            variant="secondary"
            disabled={
              isPlaceholderData || page + 1 >= (data?.page.totalPages ?? 0)
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
          </Button>
        </div>
      </div>
    </div>
  );
}
