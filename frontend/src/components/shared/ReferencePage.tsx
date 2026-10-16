"use client";
import { useState, useEffect, type ReactNode } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import type { Page, PageQuery } from "@/types/api";
import { extractApiErrorMessage } from "@/types/api";
import { DataTable, useTableState, type Column } from "./DataTable";
import { invalidateReference } from "@/lib/api/cache";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "./ConfirmDialog";
import SearchSelect from "@/components/ui/SearchSelect";
import { lookupFamilles } from "@/features/familles/services/familleService";

export default function ReferencePage<
  T extends { id: string; isActive: boolean },
>({
  title,
  resource,
  list,
  remove,
  columns,
  form,
  defaultSort = "code",
  familyFilter = false,
}: {
  title: string;
  resource: string;
  list: (q: PageQuery) => Promise<Page<T>>;
  remove: (id: string) => Promise<void>;
  columns: Column<T>[];
  form: (initial: T | undefined, onClose: () => void) => ReactNode;
  defaultSort?: string;
  familyFilter?: boolean;
}) {
  const table = useTableState(defaultSort);
  const [term, setTerm] = useState(""),
    [search, setSearch] = useState(""),
    [active, setActive] = useState(""),
    [familleId, setFamilleId] = useState("");
  const [modal, setModal] = useState(false),
    [editing, setEditing] = useState<T | undefined>(),
    [deleted, setDeleted] = useState<T | null>(null);
  const qc = useQueryClient();
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(term);
    }, 250);
    return () => clearTimeout(id);
  }, [term]);
  const query = useQuery({
    queryKey: [
      resource,
      table.page,
      table.size,
      table.sortBy,
      table.sortDirection,
      search,
      active,
      familleId,
    ],
    queryFn: () =>
      list({
        page: table.page,
        size: table.size,
        sortBy: table.sortBy,
        sortDirection: table.sortDirection,
        search: search || undefined,
        isActive: active ? active === "true" : undefined,
        familleId: familleId || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  const deletion = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      invalidateReference(qc, resource);
      setDeleted(null);
      table.resetPage();
    },
  });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-gray-500 mt-1">Gestion du référentiel</p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined);
            setModal(true);
          }}
        >
          Ajouter
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <Input
          label="Recherche"
          placeholder="Code, référence ou nom…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            table.resetPage();
          }}
        />
        <Select
          label="Statut"
          aria-label="Statut"
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            table.resetPage();
          }}
          options={[
            { value: "", label: "Tous les statuts" },
            { value: "true", label: "Actifs" },
            { value: "false", label: "Inactifs" },
          ]}
        />
        {familyFilter && (
          <SearchSelect
            label="Famille"
            value={familleId}
            onChange={(id) => {
              setFamilleId(id);
              table.resetPage();
            }}
            onSearch={lookupFamilles}
            queryKey="familles"
            getId={(r) => r.id}
            getLabel={(r) => r.label}
            placeholder="Toutes les familles"
          />
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setTerm("");
            setSearch("");
            setActive("");
            setFamilleId("");
            table.resetPage();
          }}
        >
          Réinitialiser
        </Button>
      </div>
      <DataTable
        label={title}
        rows={query.data?.content ?? []}
        total={query.data?.page.totalElements ?? 0}
        rowKey={(r) => r.id}
        state={table}
        loading={query.isLoading}
        busy={query.isPlaceholderData}
        error={query.error}
        columns={[
          ...columns,
          {
            key: "status",
            label: "Statut",
            render: (r) => (
              <span
                className={
                  "inline-flex rounded-full px-2 py-1 text-xs " +
                  (r.isActive
                    ? "bg-green-50 text-green-800"
                    : "bg-gray-100 text-gray-700")
                }
              >
                {r.isActive ? "Actif" : "Inactif"}
              </span>
            ),
          },
          {
            key: "actions",
            label: "Actions",
            render: (r) => (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(r);
                    setModal(true);
                  }}
                >
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    deletion.reset();
                    setDeleted(r);
                  }}
                >
                  Supprimer
                </Button>
              </div>
            ),
          },
        ]}
      />
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={(editing ? "Modifier — " : "Ajouter — ") + title}
      >
        {modal && form(editing, () => setModal(false))}
      </Modal>
      <ConfirmDialog
        open={!!deleted}
        onClose={() => setDeleted(null)}
        onConfirm={() => deleted && deletion.mutate(deleted.id)}
        loading={deletion.isPending}
        error={deletion.error ? extractApiErrorMessage(deletion.error) : null}
      />
    </div>
  );
}
