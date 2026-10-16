'use client';

import { useQuery } from '@tanstack/react-query';
import { getAnnualReport } from '@/features/analytics/services/analyticsService';
import { formatDinar } from '@/utils';
import { familleBadgeColor } from '@/lib/constants';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useState } from 'react';

const currentYear = new Date().getFullYear();

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-green-600">{formatDinar(value)}</p>
    </div>
  );
}

function SectionBar({
  name,
  achat,
  vente,
  stock,
  max,
  barColor,
  badge,
}: {
  name: string;
  achat: number;
  vente: number;
  stock: number;
  max: number;
  barColor: string;
  badge?: React.ReactNode;
}) {
  const pct = max > 0 ? Math.min(Math.round((achat / max) * 100), 100) : 0;
  return (
    <div className="px-6 py-4 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-2 mb-3">
        <p className="font-semibold text-gray-900">{name}</p>
        {badge}
      </div>
      <div className="grid grid-cols-3 gap-4 mb-3">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Achat</p>
          <p className="text-sm font-semibold text-gray-900">{formatDinar(achat)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Vente</p>
          <p className="text-sm font-semibold text-green-600">{formatDinar(vente)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Stock</p>
          <p className="text-sm font-semibold text-blue-600">{formatDinar(stock)}</p>
        </div>
      </div>
      <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`${barColor} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BilanPage() {
  const [year, setYear] = useState(currentYear);

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'bilan', year],
    queryFn: () => getAnnualReport(year),
  });

  if (isLoading) return <LoadingSpinner fullPage />;
  if (!data) return null;

  const { cumulative, parFournisseur, parMagasin, parFamille } = data;

  const maxFournisseur = Math.max(...(parFournisseur?.map((r) => r.totalAchat) ?? [1]), 1);
  const maxMagasin = Math.max(...(parMagasin?.map((r) => r.totalAchat) ?? [1]), 1);
  const maxFamille = Math.max(...(parFamille?.map((r) => r.totalAchat) ?? [1]), 1);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bilan Annuel</h1>
          <p className="text-gray-500 text-sm mt-1">Cumul annuel — {year}</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number.parseInt(e.target.value, 10))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Achat Cumulé" value={cumulative.totalAchat} />
        <StatCard label="Total Vente Cumulée" value={cumulative.totalVente} />
        <StatCard label="Valeur Stock Totale" value={cumulative.totalValeur} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
          <h2 className="font-semibold text-gray-800">Par Fournisseur</h2>
          <span className="bg-gray-100 text-gray-600 text-xs font-semibold rounded-full px-2 py-0.5">
            {parFournisseur?.length ?? 0}
          </span>
        </div>
        <div>
          {parFournisseur?.map((row) => (
            <SectionBar
              key={row.fournisseurId}
              name={row.fournisseurNom}
              achat={row.totalAchat}
              vente={row.totalVente}
              stock={row.totalValeur}
              max={maxFournisseur}
              barColor="bg-green-500"
            />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
          <h2 className="font-semibold text-gray-800">Par Magasin</h2>
          <span className="bg-purple-100 text-purple-700 text-xs font-semibold rounded-full px-2 py-0.5">
            {parMagasin?.length ?? 0}
          </span>
        </div>
        <div>
          {parMagasin?.map((row) => (
            <SectionBar
              key={row.magasinId}
              name={row.magasinNom}
              achat={row.totalAchat}
              vente={row.totalVente}
              stock={row.totalValeur}
              max={maxMagasin}
              barColor="bg-purple-500"
            />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
          <h2 className="font-semibold text-gray-800">Par Famille</h2>
          <span className="bg-orange-100 text-orange-700 text-xs font-semibold rounded-full px-2 py-0.5">
            {parFamille?.length ?? 0}
          </span>
        </div>
        <div>
          {parFamille?.map((row) => (
            <SectionBar
              key={row.familleId}
              name={row.familleNom}
              achat={row.totalAchat}
              vente={row.totalVente}
              stock={row.totalValeur}
              max={maxFamille}
              barColor="bg-orange-400"
              badge={<Badge className={familleBadgeColor(row.familleNom)}>{row.familleNom}</Badge>}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
