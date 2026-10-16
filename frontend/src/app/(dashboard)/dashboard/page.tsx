'use client';

import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, DollarSign, TrendingUp, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { getDashboard, getDrilldown } from '@/features/analytics/services/analyticsService';
import { formatDinar } from '@/utils';
import { familleBadgeColor, MONTHS } from '@/lib/constants';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import ApiErrorBanner from '@/components/shared/ApiErrorBanner';
import Badge from '@/components/ui/Badge';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

const now = new Date();
const currentYear = now.getFullYear();
const currentMonthIndex = now.getMonth();

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`rounded-xl p-3 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatDinar(value)}</p>
      </div>
    </div>
  );
}

function FournisseurDrilldown({
  fournisseurId,
  fournisseurNom,
  year,
  month,
}: {
  fournisseurId: string;
  fournisseurNom: string;
  year: number;
  month: number;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', 'drilldown', 'fournisseurs', fournisseurId, year, month],
    queryFn: () => getDrilldown('fournisseurs', fournisseurId, { year, month }),
  });

  return (
    <tr>
      <td colSpan={5} className="px-0 py-0">
        <div className="bg-gray-50 border-t border-gray-100 px-6 py-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Détail stock — {fournisseurNom}</p>
          {error ? <ApiErrorBanner error={error} /> : isLoading ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase">
                  <th className="text-left pb-2 pr-4 font-medium">Réf. Produit</th>
                  <th className="text-right pb-2 pr-4 font-medium">Qté Stockée</th>
                  <th className="text-left pb-2 pr-4 font-medium">Magasin</th>
                  <th
                    className="text-right pb-2 pr-4 font-medium"
                    title="Coût moyen pondéré HT cumulé jusqu'à la fin du mois — base de valorisation du stock."
                  >
                    CMUP Cumulé (DT)
                  </th>
                  <th className="text-right pb-2 font-medium">Valeur Stockée (DT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.items.map((item, i) => (
                  <tr key={`${item.produitId}-${item.magasinId}-${i}`} className="text-gray-700">
                    <td className="py-2 pr-4 font-medium text-gray-900">{item.produitReference}</td>
                    <td className="py-2 pr-4 text-right">{item.qteStock}</td>
                    <td className="py-2 pr-4">{item.magasinNom}</td>
                    <td className="py-2 pr-4 text-right">{item.cmupCumule == null ? '—' : formatDinar(item.cmupCumule)}</td>
                    <td className="py-2 text-right">{formatDinar(item.totalValeur)}</td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-center text-gray-400 text-xs">
                      Aucun stock pour cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function DashboardPage() {
  const [year, setYear] = useState(currentYear);
  const [monthIndex, setMonthIndex] = useState(currentMonthIndex);
  const [expandedFournisseurId, setExpandedFournisseurId] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  useEffect(() => {
    if (user?.role === 'SECRETAIRE') {
      router.replace('/transactions');
    }
  }, [user, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', 'dashboard', year, monthIndex + 1],
    queryFn: () => getDashboard({ year, month: monthIndex + 1 }),
    enabled: user?.role === 'ADMIN',
  });

  if (isLoading || user?.role === 'SECRETAIRE') return <LoadingSpinner fullPage />;

  const kpi = data?.totals;
  const parFournisseur = data?.parFournisseur ?? [];
  const parFamille = data?.parFamille ?? [];
  const topVendues = data?.topFamillesParVente ?? [];
  const topStockees = data?.topFamillesParValeur ?? [];

  const maxVente = Math.max(...topVendues.map((r) => r.totalVente ?? 0), 1);
  const maxStock = Math.max(...topStockees.map((r) => r.totalValeur ?? 0), 1);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard KPI</h1>
          <p className="text-gray-500 text-sm mt-1">Reporting mensuel consolidé</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => {
              const nextYear = Number(e.target.value);
              setYear(nextYear);
              if (nextYear === currentYear && monthIndex > currentMonthIndex) setMonthIndex(currentMonthIndex);
            }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={monthIndex}
            onChange={(e) => setMonthIndex(Number.parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i} disabled={year === currentYear && i > currentMonthIndex}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ApiErrorBanner error={error} />
      {kpi && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="Total Achats TTC" value={kpi.totalAchat} icon={ShoppingCart} color="bg-blue-500" />
          <KpiCard label="Total Ventes TTC" value={kpi.totalVente} icon={DollarSign} color="bg-green-500" />
          <KpiCard label="Marge Nette" value={kpi.marge} icon={TrendingUp} color="bg-purple-500" />
          <KpiCard label="Total valeur stockée" value={kpi.totalValeur} icon={Package} color="bg-orange-500" />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Par Fournisseur</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="text-left px-5 py-3">Fournisseur</th>
                <th className="text-right px-5 py-3">Total Achat TTC</th>
                <th className="text-right px-5 py-3">Total Vente TTC</th>
                <th className="text-right px-5 py-3">Marge</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parFournisseur.map((row) => {
                const isExpanded = expandedFournisseurId === row.fournisseurId;
                return (
                  <React.Fragment key={row.fournisseurId}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedFournisseurId(isExpanded ? null : row.fournisseurId)}
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">{row.fournisseurNom}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatDinar(row.totalAchat)}</td>
                      <td className="px-5 py-3 text-right text-green-600 font-medium">{formatDinar(row.totalVente)}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatDinar(row.marge)}</td>
                      <td className="px-5 py-3 text-gray-400">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                    </tr>
                    {isExpanded && (
                      <FournisseurDrilldown
                        key={`drilldown-${row.fournisseurId}`}
                        fournisseurId={row.fournisseurId}
                        fournisseurNom={row.fournisseurNom}
                        year={year}
                        month={monthIndex + 1}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Top Familles Vendues</h2>
          </div>
          <div className="p-5 space-y-3">
            {topVendues.map((row, i) => (
              <div key={row.familleId}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-4">#{i + 1}</span>
                    <Badge className={familleBadgeColor(row.familleNom)}>{row.familleNom}</Badge>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{formatDinar(row.totalVente ?? 0)}</span>
                </div>
                <div className="ml-6 bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.round(((row.totalVente ?? 0) / maxVente) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Familles plus Stockées</h2>
          </div>
          <div className="p-5 space-y-3">
            {topStockees.map((row, i) => (
              <div key={row.familleId}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-4">#{i + 1}</span>
                    <Badge className={familleBadgeColor(row.familleNom)}>{row.familleNom}</Badge>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{formatDinar(row.totalValeur ?? 0)}</span>
                </div>
                <div className="ml-6 bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.round(((row.totalValeur ?? 0) / maxStock) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Par Famille</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="text-left px-5 py-3">Famille</th>
                <th className="text-right px-5 py-3">Total Achat TTC</th>
                <th className="text-right px-5 py-3">Total Vente TTC</th>
                <th className="text-right px-5 py-3">Valeur Stocks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parFamille.map((row) => (
                <tr key={row.familleId} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Badge className={familleBadgeColor(row.familleNom)}>{row.familleNom}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatDinar(row.totalAchat)}</td>
                  <td className="px-5 py-3 text-right text-green-600 font-medium">{formatDinar(row.totalVente)}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatDinar(row.totalValeur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
