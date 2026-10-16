'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAnnualReport } from '@/features/analytics/services/analyticsService';
import { formatDinar } from '@/utils';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import ApiErrorBanner from '@/components/shared/ApiErrorBanner';

const currentYear = new Date().getFullYear();
export default function BilanPage() {
  const [year, setYear] = useState(currentYear);
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', 'bilan', year],
    queryFn: () => getAnnualReport(year),
  });
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bilan Annuel</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.label ?? year}</p>
        </div>
        <select
          aria-label="Année"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 bg-white"
        >
          {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </div>
      <ApiErrorBanner error={error} />
      {isLoading && <LoadingSpinner />}
      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              ['Total Achats Cumulés', data.cumulAchat],
              ['Total Ventes Cumulées', data.cumulVente],
              ['Marge Cumulée', data.cumulMarge],
              ['Valeur Stock en Fin de Période', data.cumValeur],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="bg-white rounded-xl border p-5"
              >
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-xl font-bold mt-2">
                  {formatDinar(Number(value))}
                </p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border overflow-x-auto">
            <h2 className="font-semibold px-5 py-4 border-b">
              Évolution mensuelle
            </h2>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-4">Mois</th>
                  <th className="text-right p-4">Achats TTC</th>
                  <th className="text-right p-4">Ventes TTC</th>
                  <th className="text-right p-4">Lignes</th>
                </tr>
              </thead>
              <tbody>
                {data.evolution.map((row) => (
                  <tr key={row.month} className="border-t">
                    <td className="p-4">{row.monthLabel}</td>
                    <td className="p-4 text-right">
                      {formatDinar(row.totalAchat)}
                    </td>
                    <td className="p-4 text-right">
                      {formatDinar(row.totalVente)}
                    </td>
                    <td className="p-4 text-right">{row.nbTx}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500">
            Classements du dernier mois de la période. Les cumuls annuels
            figurent ci-dessus.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              {
                title: 'Fournisseurs',
                rows: data.topFournisseurs.map((r) => ({
                  id: r.fournisseurId,
                  name: r.fournisseurNom,
                  value: r.totalVente,
                })),
              },
              {
                title: 'Familles',
                rows: data.topFamilles.map((r) => ({
                  id: r.familleId,
                  name: r.familleNom,
                  value: r.totalVente,
                })),
              },
              {
                title: 'Magasins',
                rows: data.topMagasins.map((r) => ({
                  id: r.magasinId,
                  name: r.magasinNom,
                  value: r.totalVente,
                })),
              },
            ].map((group) => (
              <section
                key={group.title}
                className="bg-white rounded-xl border p-5"
              >
                <h2 className="font-semibold mb-3">
                  {group.title} — Ventes TTC
                </h2>
                {group.rows.length === 0 && (
                  <p className="text-sm text-gray-500">Aucune donnée</p>
                )}
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex justify-between gap-4 border-t py-3 text-sm"
                  >
                    <span>{row.name}</span>
                    <span className="font-semibold">
                      {formatDinar(row.value)}
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
