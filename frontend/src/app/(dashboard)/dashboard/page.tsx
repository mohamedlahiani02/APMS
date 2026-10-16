"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getDashboard,
  getDrilldown,
  type AnalyticsScope,
} from "@/features/analytics/services/analyticsService";
import { lookupFamilles } from "@/features/familles/services/familleService";
import { lookupMagasins } from "@/features/magasins/services/magasinService";
import { lookupFournisseurs } from "@/features/fournisseurs/services/fournisseurService";
import { formatDinar, todayISO } from "@/utils";
import { MONTHS } from "@/lib/constants";
import SearchSelect from "@/components/ui/SearchSelect";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import ApiErrorBanner from "@/components/shared/ApiErrorBanner";
import { ClientTable } from "@/components/shared/DataTable";
import type { DashboardKpiResponse } from "@/types";

function SupplierStock({
  id,
  year,
  month,
  scope,
}: {
  id: string;
  year: number;
  month: number;
  scope: AnalyticsScope;
}) {
  const query = useQuery({
    queryKey: ["analytics", "drilldown", id, year, month, scope],
    queryFn: () => getDrilldown("fournisseurs", id, { year, month, ...scope }),
  });
  return (
    <div className="space-y-3">
      <ApiErrorBanner error={query.error} />
      {query.isLoading ? (
        <p role="status">Chargement…</p>
      ) : (
        query.data && (
          <>
            <p className="text-sm text-gray-500">
              {MONTHS[month - 1]} {year} · même périmètre que le tableau de bord
            </p>
            <ClientTable
              label="Stock du fournisseur"
              rows={query.data.items}
              rowKey={(r) =>
                [r.produitId, r.magasinId, r.fournisseurId].join("-")
              }
              searchText={(r) =>
                r.produitReference +
                " " +
                r.produitDesignation +
                " " +
                r.magasinNom
              }
              columns={[
                {
                  key: "reference",
                  label: "Référence",
                  sortValue: (r) => r.produitReference,
                  render: (r) => (
                    <span className="font-mono">{r.produitReference}</span>
                  ),
                },
                {
                  key: "designation",
                  label: "Produit",
                  sortValue: (r) => r.produitDesignation,
                  render: (r) => r.produitDesignation,
                },
                {
                  key: "magasin",
                  label: "Magasin",
                  sortValue: (r) => r.magasinNom,
                  render: (r) => r.magasinNom,
                },
                {
                  key: "qte",
                  label: "Quantité",
                  numeric: true,
                  sortValue: (r) => r.qteStock,
                  render: (r) => r.qteStock.toLocaleString("fr-TN"),
                },
                {
                  key: "cmup",
                  label: "Coût moyen HT",
                  numeric: true,
                  sortValue: (r) => r.cmupCumule,
                  render: (r) =>
                    r.cmupCumule == null ? "—" : formatDinar(r.cmupCumule),
                },
                {
                  key: "value",
                  label: "Valeur HT",
                  numeric: true,
                  sortValue: (r) => r.totalValeur,
                  render: (r) => formatDinar(r.totalValeur),
                },
                {
                  key: "deficit",
                  label: "Déficit",
                  numeric: true,
                  sortValue: (r) => r.qteDeficit,
                  render: (r) => r.qteDeficit.toLocaleString("fr-TN"),
                },
              ]}
            />
          </>
        )
      )}
    </div>
  );
}
function Kpis({ data }: { data: DashboardKpiResponse }) {
  const metrics = [
    {
      key: "totalAchat" as const,
      label: "Achats TTC",
      color: "border-l-blue-500",
    },
    {
      key: "totalVente" as const,
      label: "Ventes TTC",
      color: "border-l-emerald-500",
    },
    {
      key: "marge" as const,
      label: "Écart ventes − achats TTC",
      color: "border-l-violet-500",
    },
    {
      key: "totalValeur" as const,
      label: "Valeur du stock HT",
      color: "border-l-amber-500",
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
      {metrics.map((m) => {
        const previous = data.previousPeriod?.[m.key];
        const delta = previous == null ? null : data.totals[m.key] - previous;
        return (
          <div
            key={m.key}
            className={
              "rounded-xl border border-gray-200 border-l-4 bg-white p-5 " +
              m.color
            }
          >
            <p className="text-sm text-gray-600">{m.label}</p>
            <p className="text-2xl font-bold tabular-nums mt-2 break-words">
              {formatDinar(data.totals[m.key])}
            </p>
            {previous != null && (
              <p className="text-xs text-gray-500 mt-3">
                Mois précédent : {formatDinar(previous)}
                <br />
                Variation : {delta! > 0 ? "+" : ""}
                {formatDinar(delta)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
export default function DashboardPage() {
  const today = todayISO(),
    currentYear = Number(today.slice(0, 4)),
    currentMonth = Number(today.slice(5, 7));
  const [year, setYear] = useState(currentYear),
    [month, setMonth] = useState(currentMonth);
  const [magasinId, setMagasinId] = useState(""),
    [familleId, setFamilleId] = useState(""),
    [fournisseurId, setFournisseurId] = useState("");
  const [dimension, setDimension] = useState<
    "fournisseurs" | "familles" | "magasins"
  >("fournisseurs");
  const [supplier, setSupplier] = useState<{ id: string; nom: string } | null>(
    null,
  );
  const scope = {
    magasinId: magasinId || undefined,
    familleId: familleId || undefined,
    fournisseurId: fournisseurId || undefined,
  };
  const query = useQuery({
    queryKey: ["analytics", "dashboard", year, month, scope],
    queryFn: () => getDashboard({ year, month, ...scope }),
  });
  const data = query.data;
  const selectedCount = [magasinId, familleId, fournisseurId].filter(
    Boolean,
  ).length;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <p className="text-sm text-gray-500 mt-1">
          {MONTHS[month - 1]} {year} ·{" "}
          {selectedCount
            ? selectedCount + " filtre(s) de périmètre"
            : "Tous les magasins, familles et fournisseurs"}
        </p>
      </div>
      <section
        aria-label="Période et périmètre des indicateurs"
        className="rounded-xl border bg-white p-4 space-y-3"
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <Select
            label="Année"
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value);
              setYear(y);
              if (y === currentYear && month > currentMonth)
                setMonth(currentMonth);
              setSupplier(null);
            }}
            options={[currentYear - 2, currentYear - 1, currentYear].map(
              (y) => ({ value: y, label: String(y) }),
            )}
          />
          <div>
            <label
              htmlFor="kpi-month"
              className="block text-sm font-medium mb-1"
            >
              Mois
            </label>
            <select
              id="kpi-month"
              value={month}
              onChange={(e) => {
                setMonth(Number(e.target.value));
                setSupplier(null);
              }}
              className="w-full rounded-lg border px-3 py-2 bg-white text-sm"
            >
              {MONTHS.map((m, i) => (
                <option
                  key={m}
                  value={i + 1}
                  disabled={year === currentYear && i + 1 > currentMonth}
                >
                  {m}
                </option>
              ))}
            </select>
          </div>
          <SearchSelect
            label="Magasin"
            value={magasinId}
            onChange={(id) => {
              setMagasinId(id);
              setSupplier(null);
            }}
            onSearch={lookupMagasins}
            queryKey="magasins"
            getId={(r) => r.id}
            getLabel={(r) => r.label}
            placeholder="Tous les magasins"
          />
          <SearchSelect
            label="Famille"
            value={familleId}
            onChange={(id) => {
              setFamilleId(id);
              setSupplier(null);
            }}
            onSearch={lookupFamilles}
            queryKey="familles"
            getId={(r) => r.id}
            getLabel={(r) => r.label}
            placeholder="Toutes les familles"
          />
          <SearchSelect
            label="Fournisseur"
            value={fournisseurId}
            onChange={(id) => {
              setFournisseurId(id);
              setSupplier(null);
            }}
            onSearch={lookupFournisseurs}
            queryKey="fournisseurs"
            getId={(r) => r.id}
            getLabel={(r) => r.label}
            placeholder="Tous les fournisseurs"
          />
        </div>
        <div className="flex flex-wrap justify-between items-center gap-3">
          <p className="text-xs text-gray-500">
            Ce périmètre s’applique à tous les indicateurs, classements et
            détails.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setYear(currentYear);
              setMonth(currentMonth);
              setMagasinId("");
              setFamilleId("");
              setFournisseurId("");
              setSupplier(null);
            }}
          >
            Réinitialiser
          </Button>
        </div>
      </section>
      <ApiErrorBanner error={query.error} />
      {query.isLoading && (
        <div
          role="status"
          className="rounded-xl border bg-white p-8 text-center text-gray-500"
        >
          Chargement des indicateurs…
        </div>
      )}
      {data && (
        <>
          <Kpis data={data} />
          <p className="text-xs text-gray-500">
            Écart = ventes TTC − achats TTC ; les charges d’exploitation ne sont
            pas incluses. Valeur du stock à la fin de la période, au coût moyen
            HT. Comparaison avec{" "}
            {data.previousPeriod
              ? MONTHS[data.previousPeriod.month - 1] +
                " " +
                data.previousPeriod.year
              : "le mois précédent"}
            .
          </p>
          {data.totals.nbTx === 0 && (
            <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
              Aucune ligne d’achat ou de vente sur cette période et ce
              périmètre. Un stock historique peut néanmoins être présent.
            </p>
          )}
          <section className="space-y-3">
            <div
              className="flex flex-wrap gap-2"
              aria-label="Ventilation des indicateurs"
            >
              {(["fournisseurs", "familles", "magasins"] as const).map((d) => (
                <Button
                  key={d}
                  variant={dimension === d ? "primary" : "secondary"}
                  aria-pressed={dimension === d}
                  onClick={() => setDimension(d)}
                >
                  {d === "fournisseurs"
                    ? "Par fournisseur"
                    : d === "familles"
                      ? "Par famille"
                      : "Par magasin"}
                </Button>
              ))}
            </div>
            {dimension === "fournisseurs" ? (
              <ClientTable
                label="Indicateurs par fournisseur"
                rows={data.parFournisseur}
                rowKey={(r) => r.fournisseurId}
                searchText={(r) => r.fournisseurNom}
                columns={[
                  {
                    key: "name",
                    label: "Fournisseur",
                    sortValue: (r) => r.fournisseurNom,
                    render: (r) => r.fournisseurNom,
                  },
                  {
                    key: "achat",
                    label: "Achats TTC",
                    numeric: true,
                    sortValue: (r) => r.totalAchat,
                    render: (r) => formatDinar(r.totalAchat),
                  },
                  {
                    key: "vente",
                    label: "Ventes TTC",
                    numeric: true,
                    sortValue: (r) => r.totalVente,
                    render: (r) => formatDinar(r.totalVente),
                  },
                  {
                    key: "marge",
                    label: "Écart TTC",
                    numeric: true,
                    sortValue: (r) => r.marge,
                    render: (r) => formatDinar(r.marge),
                  },
                  {
                    key: "detail",
                    label: "Détail",
                    render: (r) => (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setSupplier({
                            id: r.fournisseurId,
                            nom: r.fournisseurNom,
                          })
                        }
                      >
                        Voir le stock
                      </Button>
                    ),
                  },
                ]}
              />
            ) : dimension === "familles" ? (
              <ClientTable
                label="Indicateurs par famille"
                rows={data.parFamille}
                rowKey={(r) => r.familleId}
                searchText={(r) => r.familleNom}
                columns={[
                  {
                    key: "name",
                    label: "Famille",
                    sortValue: (r) => r.familleNom,
                    render: (r) => r.familleNom,
                  },
                  {
                    key: "achat",
                    label: "Achats TTC",
                    numeric: true,
                    sortValue: (r) => r.totalAchat,
                    render: (r) => formatDinar(r.totalAchat),
                  },
                  {
                    key: "vente",
                    label: "Ventes TTC",
                    numeric: true,
                    sortValue: (r) => r.totalVente,
                    render: (r) => formatDinar(r.totalVente),
                  },
                  {
                    key: "stock",
                    label: "Stock HT",
                    numeric: true,
                    sortValue: (r) => r.totalValeur,
                    render: (r) => formatDinar(r.totalValeur),
                  },
                ]}
              />
            ) : (
              <ClientTable
                label="Indicateurs par magasin"
                rows={data.parMagasin}
                rowKey={(r) => r.magasinId}
                searchText={(r) => r.magasinNom}
                columns={[
                  {
                    key: "name",
                    label: "Magasin",
                    sortValue: (r) => r.magasinNom,
                    render: (r) => r.magasinNom,
                  },
                  {
                    key: "achat",
                    label: "Achats TTC",
                    numeric: true,
                    sortValue: (r) => r.totalAchat,
                    render: (r) => formatDinar(r.totalAchat),
                  },
                  {
                    key: "vente",
                    label: "Ventes TTC",
                    numeric: true,
                    sortValue: (r) => r.totalVente,
                    render: (r) => formatDinar(r.totalVente),
                  },
                  {
                    key: "stock",
                    label: "Stock HT",
                    numeric: true,
                    sortValue: (r) => r.totalValeur,
                    render: (r) => formatDinar(r.totalValeur),
                  },
                ]}
              />
            )}
          </section>
          <details className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer font-semibold">
              Classements des familles — 5 premières
            </summary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <section>
                <h2 className="font-medium mb-2">Ventes TTC</h2>
                {data.topFamillesParVente.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Aucune donnée sur cette période.
                  </p>
                ) : (
                  <ol className="divide-y">
                    {data.topFamillesParVente.map((r) => (
                      <li
                        key={r.familleId}
                        className="flex justify-between gap-3 py-3 text-sm"
                      >
                        <span>{r.familleNom}</span>
                        <span className="tabular-nums font-semibold">
                          {formatDinar(r.totalVente)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <section>
                <h2 className="font-medium mb-2">Valeur du stock HT</h2>
                {data.topFamillesParValeur.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Aucune donnée sur cette période.
                  </p>
                ) : (
                  <ol className="divide-y">
                    {data.topFamillesParValeur.map((r) => (
                      <li
                        key={r.familleId}
                        className="flex justify-between gap-3 py-3 text-sm"
                      >
                        <span>{r.familleNom}</span>
                        <span className="tabular-nums font-semibold">
                          {formatDinar(r.totalValeur)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </details>
        </>
      )}
      <Modal
        open={!!supplier}
        onClose={() => setSupplier(null)}
        title={"Stock — " + (supplier?.nom ?? "")}
        size="xl"
      >
        {supplier && (
          <SupplierStock
            id={supplier.id}
            year={year}
            month={month}
            scope={scope}
          />
        )}
      </Modal>
    </div>
  );
}
