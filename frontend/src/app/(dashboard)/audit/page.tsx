"use client";
import { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  listAudit,
  getEntityHistory,
} from "@/features/audit/services/auditService";
import { listUsers } from "@/features/users/services/userService";
import { formatDateTime } from "@/utils";
import type { AuditEntry } from "@/types";
import {
  DataTable,
  ClientTable,
  useTableState,
} from "@/components/shared/DataTable";
import DateRange from "@/components/shared/DateRange";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SearchSelect from "@/components/ui/SearchSelect";
import ApiErrorBanner from "@/components/shared/ApiErrorBanner";
const actions: Record<string, string> = {
  CREATE: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
  LOGIN: "Connexion",
  LOGIN_FAILED: "Connexion échouée",
  LOGOUT: "Déconnexion",
  LOCK: "Verrouillage",
  UNLOCK: "Déverrouillage",
  PASSWORD_RESET: "Mot de passe réinitialisé",
};
const entities: Record<string, string> = {
  USER: "Utilisateur",
  AUTH: "Authentification",
  FAMILLE: "Famille",
  FOURNISSEUR: "Fournisseur",
  MAGASIN: "Magasin",
  PRODUIT: "Produit",
  BL_ACHAT: "BL achat",
  VENTE: "Vente",
  STOCK: "Stock",
  TRANSACTION: "Transaction historique",
};
function History({ entry }: { entry: AuditEntry }) {
  const query = useQuery({
    queryKey: ["audit-history", entry.entityType, entry.entityId],
    queryFn: () => getEntityHistory(entry.entityType, entry.entityId!),
  });
  return (
    <div className="space-y-3">
      <ApiErrorBanner error={query.error} />
      {query.isLoading ? (
        <p role="status">Chargement…</p>
      ) : (
        <ClientTable
          label="Historique"
          rows={query.data ?? []}
          rowKey={(r) => r.id}
          searchText={(r) => (r.summary ?? "") + " " + (r.actorEmail ?? "")}
          columns={[
            {
              key: "date",
              label: "Date",
              sortValue: (r) => r.timestamp,
              render: (r) => formatDateTime(r.timestamp),
            },
            {
              key: "author",
              label: "Auteur",
              sortValue: (r) => r.actorEmail,
              render: (r) => r.actorEmail ?? "Système",
            },
            {
              key: "action",
              label: "Action",
              sortValue: (r) => r.action,
              render: (r) => actions[r.action] ?? r.action,
            },
            {
              key: "summary",
              label: "Résumé",
              render: (r) => (
                <div>
                  {r.summary ?? "—"}
                  {r.changes != null && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs underline">
                        Voir les modifications
                      </summary>
                      <pre className="max-h-48 max-w-lg overflow-auto whitespace-pre-wrap break-words mt-2 text-xs">
                        {JSON.stringify(r.changes, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
export default function AuditPage() {
  const table = useTableState("timestamp", "desc");
  const [entityType, setEntityType] = useState(""),
    [actorId, setActorId] = useState(""),
    [action, setAction] = useState(""),
    [dateFrom, setDateFrom] = useState(""),
    [dateTo, setDateTo] = useState(""),
    [term, setTerm] = useState(""),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(term);
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);
  const query = useQuery({
    queryKey: [
      "audit",
      table.page,
      table.size,
      table.sortBy,
      table.sortDirection,
      entityType,
      actorId,
      action,
      dateFrom,
      dateTo,
      search,
    ],
    queryFn: () =>
      listAudit({
        page: table.page,
        size: table.size,
        sortBy: table.sortBy,
        sortDirection: table.sortDirection,
        entityType: entityType || undefined,
        actorId: actorId || undefined,
        action: action || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Journal d’audit</h1>
        <p className="mt-1 text-sm text-gray-500">
          Actions et modifications — dates à l’heure de Tunis
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
        <Input
          label="Recherche"
          placeholder="Rechercher dans les résumés…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            table.resetPage();
          }}
        />
        <Select
          label="Entité"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            table.resetPage();
          }}
          options={[
            { value: "", label: "Toutes les entités" },
            ...Object.entries(entities).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <Select
          label="Action"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            table.resetPage();
          }}
          options={[
            { value: "", label: "Toutes les actions" },
            ...Object.entries(actions).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <SearchSelect
          label="Auteur"
          value={actorId}
          onChange={(id) => {
            setActorId(id);
            table.resetPage();
          }}
          onSearch={async (q) =>
            (await listUsers({ search: q, size: 20 })).content.map((u) => ({
              id: u.id,
              label: u.email,
            }))
          }
          queryKey="audit-users"
          getId={(r) => r.id}
          getLabel={(r) => r.label}
          placeholder="Tous les auteurs"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <DateRange
          from={dateFrom}
          to={dateTo}
          onChange={(a, b) => {
            setDateFrom(a);
            setDateTo(b);
            table.resetPage();
          }}
        />
        <Button
          variant="secondary"
          onClick={() => {
            setEntityType("");
            setActorId("");
            setAction("");
            setDateFrom("");
            setDateTo("");
            setTerm("");
            setSearch("");
            table.resetPage();
          }}
        >
          Réinitialiser
        </Button>
      </div>
      <DataTable
        label="Journal d’audit"
        rows={query.data?.content ?? []}
        rowKey={(r) => r.id}
        total={query.data?.page.totalElements ?? 0}
        state={table}
        loading={query.isLoading}
        busy={query.isPlaceholderData}
        error={query.error}
        columns={[
          {
            key: "timestamp",
            label: "Date",
            sortable: true,
            render: (r) => formatDateTime(r.timestamp),
          },
          {
            key: "actorEmail",
            label: "Auteur",
            sortable: true,
            render: (r) => r.actorEmail ?? "Système",
          },
          {
            key: "entityType",
            label: "Entité",
            sortable: true,
            render: (r) => entities[r.entityType] ?? r.entityType,
          },
          {
            key: "action",
            label: "Action",
            sortable: true,
            render: (r) => actions[r.action] ?? r.action,
          },
          { key: "summary", label: "Résumé", render: (r) => r.summary ?? "—" },
          {
            key: "history",
            label: "Détail",
            render: (r) =>
              r.entityId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelected(r)}
                >
                  Historique
                </Button>
              ) : (
                "—"
              ),
          },
        ]}
      />
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Historique de l’entité"
        size="xl"
      >
        {selected && <History entry={selected} />}
      </Modal>
    </div>
  );
}
