"use client";
import { useState, useEffect } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listStock } from "@/features/stock/services/stockService";
import { lookupMagasins } from "@/features/magasins/services/magasinService";
import { lookupFamilles } from "@/features/familles/services/familleService";
import { formatDinar } from "@/utils";
import SearchSelect from "@/components/ui/SearchSelect";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { DataTable, useTableState } from "@/components/shared/DataTable";
export default function StockPage() {
  const table = useTableState("reference");
  const [term, setTerm] = useState(""),
    [search, setSearch] = useState(""),
    [magasinId, setMagasinId] = useState(""),
    [familleId, setFamilleId] = useState(""),
    [availability, setAvailability] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(term);
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);
  const query = useQuery({
    queryKey: [
      "stock",
      table.page,
      table.size,
      table.sortBy,
      table.sortDirection,
      search,
      magasinId,
      familleId,
      availability,
    ],
    queryFn: () =>
      listStock({
        page: table.page,
        size: table.size,
        sortBy: table.sortBy,
        sortDirection: table.sortDirection,
        search: search || undefined,
        magasinId: magasinId || undefined,
        familleId: familleId || undefined,
        availability: (availability as "positive" | "zero") || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Stock disponible</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quantités actuelles par produit et magasin. Valeur HT au coût des
          lots.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
        <Input
          label="Produit"
          placeholder="Référence ou désignation…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            table.resetPage();
          }}
        />
        <SearchSelect
          label="Magasin"
          queryKey="magasins"
          value={magasinId}
          onChange={(id) => {
            setMagasinId(id);
            table.resetPage();
          }}
          onSearch={lookupMagasins}
          getId={(r) => r.id}
          getLabel={(r) => r.label}
          placeholder="Tous les magasins"
        />
        <SearchSelect
          label="Famille"
          queryKey="familles"
          value={familleId}
          onChange={(id) => {
            setFamilleId(id);
            table.resetPage();
          }}
          onSearch={lookupFamilles}
          getId={(r) => r.id}
          getLabel={(r) => r.label}
          placeholder="Toutes les familles"
        />
        <Select
          label="Disponibilité"
          value={availability}
          onChange={(e) => {
            setAvailability(e.target.value);
            table.resetPage();
          }}
          options={[
            { value: "", label: "Toutes les quantités" },
            { value: "positive", label: "En stock" },
            { value: "zero", label: "Quantité nulle" },
          ]}
        />
        <Button
          variant="secondary"
          onClick={() => {
            setTerm("");
            setSearch("");
            setMagasinId("");
            setFamilleId("");
            setAvailability("");
            table.resetPage();
          }}
        >
          Réinitialiser
        </Button>
      </div>
      <DataTable
        label="Stock"
        rows={query.data?.content ?? []}
        rowKey={(r) => r.produitId + r.magasinId}
        total={query.data?.page.totalElements ?? 0}
        state={table}
        loading={query.isLoading}
        busy={query.isPlaceholderData}
        error={query.error}
        columns={[
          {
            key: "reference",
            label: "Référence",
            sortable: true,
            render: (r) => (
              <span className="font-mono">{r.produitReference}</span>
            ),
          },
          {
            key: "designation",
            label: "Désignation",
            sortable: true,
            render: (r) => r.produitDesignation,
          },
          {
            key: "magasin",
            label: "Magasin",
            sortable: true,
            render: (r) => r.magasinNom,
          },
          {
            key: "qteDisponible",
            label: "Quantité disponible",
            sortable: true,
            numeric: true,
            render: (r) =>
              r.qteDisponible.toLocaleString("fr-TN", {
                maximumFractionDigits: 3,
              }),
          },
          {
            key: "valeur",
            label: "Valeur HT",
            sortable: true,
            numeric: true,
            render: (r) => formatDinar(r.valeur),
          },
        ]}
      />
    </div>
  );
}
