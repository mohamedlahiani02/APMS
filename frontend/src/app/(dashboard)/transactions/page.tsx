"use client";
import {
  DataTable,
  ClientTable,
  useTableState,
} from "@/components/shared/DataTable";
import DateRange from "@/components/shared/DateRange";
import Select from "@/components/ui/Select";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, X, Trash2, Download } from "lucide-react";

import {
  listBlAchats,
  createBlAchat,
  updateBlAchat,
  deleteBlAchat,
} from "@/features/bl-achats/services/blAchatService";
import {
  listVentes,
  createVente,
  updateVente,
  deleteVente,
} from "@/features/ventes/services/venteService";
import { exportExcel } from "@/features/transactions/services/transactionService";
import { lookupFournisseurs } from "@/features/fournisseurs/services/fournisseurService";
import { lookupMagasins } from "@/features/magasins/services/magasinService";
import { lookupProduits } from "@/features/produits/services/produitService";
import {
  blAchatSchema,
  BlAchatInput,
  venteSchema,
  VenteInput,
} from "@/lib/validations";
import { formatDinar, formatDate, todayISO } from "@/utils";
import { TVA_RATES } from "@/lib/constants";
import type { BlAchat, Vente } from "@/types";
import { hasApiErrorCode } from "@/types/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import SearchSelect from "@/components/ui/SearchSelect";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";

import ConfirmDialog from "@/components/shared/ConfirmDialog";

import ApiErrorBanner from "@/components/shared/ApiErrorBanner";

const BL_ACHAT_HAS_VENTES = "BL_ACHAT_HAS_VENTES";

// Invalidates every query that depends on achat/vente data, in one place, so
// dashboard/bilan/stock never go stale after a mutation.
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["transactions"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["bilan"] });
  qc.invalidateQueries({ queryKey: ["stock"] });
  qc.invalidateQueries({ queryKey: ["bl-achats"] });
  qc.invalidateQueries({ queryKey: ["ventes"] });
  qc.invalidateQueries({ queryKey: ["analytics"] });
}

// ─────────────────────────────────────────────────────────────────────────
// BL ACHAT — one produit line (searchable autocomplete over /produits/lookup)
// ─────────────────────────────────────────────────────────────────────────
function BlAchatLigneRow({
  idx,
  initialLabel,
  watch,
  setValue,
  register,
  errors,
  remove,
  canRemove,
}: {
  idx: number;
  initialLabel?: string;
  watch: ReturnType<typeof useForm<BlAchatInput>>["watch"];
  setValue: ReturnType<typeof useForm<BlAchatInput>>["setValue"];
  register: ReturnType<typeof useForm<BlAchatInput>>["register"];
  errors: ReturnType<typeof useForm<BlAchatInput>>["formState"]["errors"];
  remove: (idx: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-start bg-white rounded-lg p-3">
      <SearchSelect
        label="Produit *"
        initialLabel={initialLabel}
        value={watch(`lignes.${idx}.produitId`)}
        onChange={(id) =>
          setValue(`lignes.${idx}.produitId`, id, { shouldValidate: true })
        }
        onSearch={(q) => lookupProduits(q)}
        queryKey="produits"
        getId={(p) => p.id}
        getLabel={(p) => `${p.reference} — ${p.label}`}
        placeholder="Référence ou désignation..."
        error={errors.lignes?.[idx]?.produitId?.message}
      />
      <Input
        label="Qté *"
        type="number"
        min="0"
        step="0.001"
        error={errors.lignes?.[idx]?.qteAchetee?.message}
        {...register(`lignes.${idx}.qteAchetee`, { valueAsNumber: true })}
      />
      <Input
        label="PU Net HT *"
        type="number"
        step="0.001"
        min="0"
        error={errors.lignes?.[idx]?.prixAchatNetHt?.message}
        {...register(`lignes.${idx}.prixAchatNetHt`, { valueAsNumber: true })}
      />
      <div className="flex flex-col gap-1">
        <label
          htmlFor={"tva-" + idx}
          className="text-sm font-medium text-gray-700"
        >
          TVA *
        </label>
        <select
          id={"tva-" + idx}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          {...register(`lignes.${idx}.tauxTva`, { valueAsNumber: true })}
        >
          {TVA_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate}%
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        aria-label="Supprimer la ligne"
        onClick={() => remove(idx)}
        disabled={!canRemove}
        className="text-gray-400 hover:text-red-600 disabled:opacity-30 mt-7"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function BlAchatHeaderFields({
  register,
  errors,
  watch,
  setValue,
  initial,
}: {
  register: ReturnType<typeof useForm<BlAchatInput>>["register"];
  errors: ReturnType<typeof useForm<BlAchatInput>>["formState"]["errors"];
  watch: ReturnType<typeof useForm<BlAchatInput>>["watch"];
  setValue: ReturnType<typeof useForm<BlAchatInput>>["setValue"];
  initial?: BlAchat;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Input
        id="transactionDate"
        label="Date *"
        type="date"
        error={errors.transactionDate?.message}
        {...register("transactionDate")}
      />
      <SearchSelect
        label="Magasin *"
        value={watch("magasinId")}
        onChange={(id) => setValue("magasinId", id, { shouldValidate: true })}
        onSearch={(q) => lookupMagasins(q)}
        queryKey="magasins"
        initialLabel={initial?.magasinNom}
        getId={(m) => m.id}
        getLabel={(m) => `${m.code} — ${m.label}`}
        placeholder="Rechercher un magasin..."
        error={errors.magasinId?.message}
      />
      <SearchSelect
        label="Fournisseur *"
        value={watch("fournisseurId")}
        onChange={(id) =>
          setValue("fournisseurId", id, { shouldValidate: true })
        }
        onSearch={(q) => lookupFournisseurs(q)}
        queryKey="fournisseurs"
        initialLabel={initial?.fournisseurNom}
        getId={(f) => f.id}
        getLabel={(f) => `${f.code} — ${f.label}`}
        placeholder="Rechercher un fournisseur..."
        error={errors.fournisseurId?.message}
      />
    </div>
  );
}

function BlAchatForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BlAchatInput>({
    resolver: zodResolver(blAchatSchema),
    defaultValues: {
      transactionDate: todayISO(),
      blNumero: "",
      magasinId: "",
      fournisseurId: "",
      lignes: [
        { produitId: "", qteAchetee: 0, prixAchatNetHt: 0, tauxTva: 19 },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lignes" });

  const mutation = useMutation({
    mutationFn: (data: BlAchatInput) => createBlAchat(data),
    onSuccess: () => {
      invalidateAll(qc);
      onClose();
    },
  });

  return (
    <form
      data-guard-form
      onSubmit={handleSubmit((d) => mutation.mutate(d))}
      className="flex flex-col gap-4"
    >
      <BlAchatHeaderFields
        register={register}
        errors={errors}
        watch={watch}
        setValue={setValue}
      />
      <Input
        id="blNumero"
        label="N° Bon de Livraison *"
        placeholder="BL-2026-XXXX"
        error={errors.blNumero?.message}
        {...register("blNumero")}
      />

      <div className="bg-blue-50 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-blue-800">Produits du BL</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              append({
                produitId: "",
                qteAchetee: 0,
                prixAchatNetHt: 0,
                tauxTva: 19,
              })
            }
          >
            <Plus size={14} /> Ajouter une ligne
          </Button>
        </div>
        {errors.lignes?.message && (
          <p className="text-xs text-red-600">{errors.lignes.message}</p>
        )}
        {fields.map((field, idx) => (
          <BlAchatLigneRow
            key={field.id}
            idx={idx}
            watch={watch}
            setValue={setValue}
            register={register}
            errors={errors}
            remove={remove}
            canRemove={fields.length > 1}
          />
        ))}
      </div>

      <ApiErrorBanner error={mutation.error} />

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Enregistrer le BL
        </Button>
      </div>
    </form>
  );
}

// Header always editable. Lines are editable only while every line is still
// untouched (qteRestante === qteAchetee) — the moment a vente has drawn from
// any line, the BL locks to header-only (matches the backend's
// BL_ACHAT_HAS_VENTES rule on edit/delete).
function BlAchatEditForm({
  onClose,
  bl,
}: {
  onClose: () => void;
  bl: BlAchat;
}) {
  const qc = useQueryClient();
  const locked = bl.lignes.some((l) => l.qteRestante !== l.qteAchetee);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BlAchatInput>({
    resolver: zodResolver(blAchatSchema),
    defaultValues: {
      transactionDate: bl.transactionDate.slice(0, 10),
      blNumero: bl.blNumero,
      magasinId: bl.magasinId,
      fournisseurId: bl.fournisseurId,
      lignes: bl.lignes.map((l) => ({
        produitId: l.produitId,
        qteAchetee: l.qteAchetee,
        prixAchatNetHt: l.prixAchatNetHt,
        tauxTva: l.tauxTva as 7 | 13 | 19,
      })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lignes" });

  const mutation = useMutation({
    mutationFn: (data: BlAchatInput) =>
      updateBlAchat(bl.id, {
        transactionDate: data.transactionDate,
        blNumero: data.blNumero,
        magasinId: data.magasinId,
        fournisseurId: data.fournisseurId,
        lignes: locked ? undefined : data.lignes,
      }),
    onSuccess: () => {
      invalidateAll(qc);
      onClose();
    },
  });

  const isLockedError = hasApiErrorCode(mutation.error, BL_ACHAT_HAS_VENTES);

  return (
    <form
      data-guard-form
      onSubmit={handleSubmit((d) => mutation.mutate(d))}
      className="flex flex-col gap-4"
    >
      <BlAchatHeaderFields
        register={register}
        errors={errors}
        watch={watch}
        setValue={setValue}
        initial={bl}
      />
      <Input
        id="blNumero"
        label="N° Bon de Livraison *"
        error={errors.blNumero?.message}
        {...register("blNumero")}
      />

      {locked ? (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Les produits de ce BL ne sont pas modifiables : au moins une vente
          utilise ce BL. Seuls les champs d&apos;en-tête (date, N° BL, magasin,
          fournisseur) restent modifiables. Créez un nouveau BL pour changer les
          produits.
        </p>
      ) : (
        <div className="bg-blue-50 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-blue-800">
              Produits du BL
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                append({
                  produitId: "",
                  qteAchetee: 0,
                  prixAchatNetHt: 0,
                  tauxTva: 19,
                })
              }
            >
              <Plus size={14} /> Ajouter une ligne
            </Button>
          </div>
          {errors.lignes?.message && (
            <p className="text-xs text-red-600">{errors.lignes.message}</p>
          )}
          {fields.map((field, idx) => (
            <BlAchatLigneRow
              key={field.id}
              idx={idx}
              initialLabel={
                bl.lignes[idx]
                  ? bl.lignes[idx].produitReference +
                    " — " +
                    bl.lignes[idx].produitDesignation
                  : undefined
              }
              watch={watch}
              setValue={setValue}
              register={register}
              errors={errors}
              remove={remove}
              canRemove={fields.length > 1}
            />
          ))}
        </div>
      )}

      {isLockedError ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Une vente vient d’utiliser ce BL. Fermez puis rouvrez le formulaire
          pour modifier son en-tête.
        </p>
      ) : (
        <ApiErrorBanner error={mutation.error} />
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// VENTE — produit + quantité + prix TTC only. No lot/source picker: the
// backend draws stock automatically (oldest BL line first, then legacy lots).
// ─────────────────────────────────────────────────────────────────────────
function VenteLigneRow({
  idx,
  initialLabel,
  watch,
  setValue,
  register,
  errors,
  remove,
  canRemove,
}: {
  idx: number;
  initialLabel?: string;
  watch: ReturnType<typeof useForm<VenteInput>>["watch"];
  setValue: ReturnType<typeof useForm<VenteInput>>["setValue"];
  register: ReturnType<typeof useForm<VenteInput>>["register"];
  errors: ReturnType<typeof useForm<VenteInput>>["formState"]["errors"];
  remove: (idx: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-start bg-white rounded-lg p-3">
      <SearchSelect
        label="Produit *"
        initialLabel={initialLabel}
        value={watch(`lignes.${idx}.produitId`)}
        onChange={(id) =>
          setValue(`lignes.${idx}.produitId`, id, { shouldValidate: true })
        }
        onSearch={(q) => lookupProduits(q)}
        queryKey="produits"
        getId={(p) => p.id}
        getLabel={(p) => `${p.reference} — ${p.label}`}
        placeholder="Référence ou désignation..."
        error={errors.lignes?.[idx]?.produitId?.message}
      />
      <Input
        label="Qté vendue *"
        type="number"
        min="0"
        step="0.001"
        error={errors.lignes?.[idx]?.qteVendue?.message}
        {...register(`lignes.${idx}.qteVendue`, { valueAsNumber: true })}
      />
      <Input
        label="Prix vente TTC *"
        type="number"
        step="0.001"
        min="0"
        error={errors.lignes?.[idx]?.prixVenteTtc?.message}
        {...register(`lignes.${idx}.prixVenteTtc`, { valueAsNumber: true })}
      />
      <button
        type="button"
        aria-label="Supprimer la ligne"
        onClick={() => remove(idx)}
        disabled={!canRemove}
        className="text-gray-400 hover:text-red-600 disabled:opacity-30 mt-7"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function VenteForm({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: Vente;
}) {
  const qc = useQueryClient();
  const isEditing = !!initial;

  const defaultLignes = initial
    ? Object.values(
        initial.lignes.reduce(
          (
            acc: Record<
              string,
              { produitId: string; qteVendue: number; prixVenteTtc: number }
            >,
            l,
          ) => {
            const g = (acc[l.produitId + ":" + l.prixVenteTtc] ??= {
              produitId: l.produitId,
              qteVendue: 0,
              prixVenteTtc: l.prixVenteTtc,
            });
            g.qteVendue += l.qteVendue;
            return acc;
          },
          {},
        ),
      )
    : [{ produitId: "", qteVendue: 1, prixVenteTtc: 0 }];

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VenteInput>({
    resolver: zodResolver(venteSchema),
    defaultValues: {
      venteDate: initial ? initial.venteDate.slice(0, 10) : todayISO(),
      magasinId: initial?.magasinId ?? "",
      lignes: defaultLignes,
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lignes" });
  const venteValues = useWatch({ control });

  const mutation = useMutation({
    mutationFn: (data: VenteInput) =>
      isEditing ? updateVente(initial!.id, data) : createVente(data),
    onSuccess: () => {
      invalidateAll(qc);
      onClose();
    },
  });

  return (
    <form
      data-guard-form
      onSubmit={handleSubmit((d) => mutation.mutate(d))}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <Input
          id="venteDate"
          label="Date *"
          type="date"
          error={errors.venteDate?.message}
          {...register("venteDate")}
        />
        <SearchSelect
          label="Magasin *"
          value={venteValues.magasinId ?? ""}
          onChange={(id) => setValue("magasinId", id, { shouldValidate: true })}
          onSearch={(q) => lookupMagasins(q)}
          queryKey="magasins"
          initialLabel={initial?.magasinNom}
          getId={(m) => m.id}
          getLabel={(m) => `${m.code} — ${m.label}`}
          placeholder="Rechercher un magasin..."
          error={errors.magasinId?.message}
        />
      </div>

      <div className="bg-green-50 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-green-800">
            Produits vendus
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              append({ produitId: "", qteVendue: 1, prixVenteTtc: 0 })
            }
          >
            <Plus size={14} /> Ajouter une ligne
          </Button>
        </div>
        {errors.lignes?.message && (
          <p className="text-xs text-red-600">{errors.lignes.message}</p>
        )}
        {fields.map((field, idx) => (
          <VenteLigneRow
            key={field.id}
            idx={idx}
            initialLabel={
              initial?.lignes.find(
                (l) => l.produitId === venteValues.lignes?.[idx]?.produitId,
              )?.produitReference
            }
            watch={watch}
            setValue={setValue}
            register={register}
            errors={errors}
            remove={remove}
            canRemove={fields.length > 1}
          />
        ))}
        <p className="text-xs text-green-800">
          La quantité est prélevée automatiquement sur le stock disponible (BL
          le plus ancien d&apos;abord, puis stock historique) — aucun lot à
          choisir. Un dépassement de stock ne bloque jamais la vente : il sera
          signalé après enregistrement.
        </p>
      </div>

      <ApiErrorBanner error={mutation.error} />

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          {isEditing ? "Modifier la vente" : "Enregistrer la vente"}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────

function LineSummary({
  lines,
  onOpen,
}: {
  lines: {
    produitReference: string;
    qteAchetee?: number;
    qteVendue?: number;
  }[];
  onOpen: () => void;
}) {
  const grouped = new Map<string, number>();
  for (const line of lines)
    grouped.set(
      line.produitReference,
      (grouped.get(line.produitReference) ?? 0) +
        (line.qteAchetee ?? line.qteVendue ?? 0),
    );
  const rows = [...grouped.entries()];
  return (
    <div className="max-w-xs">
      <p className="text-sm">
        {rows
          .slice(0, 2)
          .map(([ref, qte]) => ref + " × " + qte.toLocaleString("fr-TN"))
          .join(" · ")}
      </p>
      {rows.length > 2 && (
        <button className="mt-1 text-sm underline" onClick={onOpen}>
          + {rows.length - 2} autres produits
        </button>
      )}
    </div>
  );
}
function TransactionDetail({
  inspection,
}: {
  inspection:
    | { kind: "achats"; data: BlAchat }
    | { kind: "ventes"; data: Vente };
}) {
  if (inspection.kind === "achats")
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          {inspection.data.blNumero} ·{" "}
          {formatDate(inspection.data.transactionDate)} ·{" "}
          {inspection.data.magasinNom} · {inspection.data.fournisseurNom}
        </p>
        <ClientTable
          label="Lignes du BL achat"
          rows={inspection.data.lignes}
          rowKey={(r) => r.id}
          searchText={(r) => r.produitReference + " " + r.produitDesignation}
          columns={[
            {
              key: "reference",
              label: "Référence",
              sortValue: (r) => r.produitReference,
              render: (r) => r.produitReference,
            },
            {
              key: "designation",
              label: "Produit",
              render: (r) => r.produitDesignation,
            },
            {
              key: "quantity",
              label: "Quantité achetée",
              numeric: true,
              sortValue: (r) => r.qteAchetee,
              render: (r) => r.qteAchetee.toLocaleString("fr-TN"),
            },
            {
              key: "remaining",
              label: "Restante",
              numeric: true,
              sortValue: (r) => r.qteRestante,
              render: (r) => r.qteRestante.toLocaleString("fr-TN"),
            },
            {
              key: "unit",
              label: "Prix unitaire HT",
              numeric: true,
              sortValue: (r) => r.prixAchatNetHt,
              render: (r) => formatDinar(r.prixAchatNetHt),
            },
            {
              key: "total",
              label: "Total TTC",
              numeric: true,
              sortValue: (r) => r.prixAchatTotalTtc,
              render: (r) => formatDinar(r.prixAchatTotalTtc),
            },
          ]}
        />
      </div>
    );
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        {formatDate(inspection.data.venteDate)} · {inspection.data.magasinNom} ·
        Total TTC : {formatDinar(inspection.data.totalTtc)}
      </p>
      <p className="text-xs text-gray-500">
        Un produit peut utiliser plusieurs sources de stock ; le détail les
        distingue ci-dessous.
      </p>
      <ClientTable
        label="Détail de la vente"
        rows={inspection.data.lignes}
        rowKey={(r) => r.id}
        searchText={(r) => r.produitReference + " " + r.produitDesignation}
        columns={[
          {
            key: "reference",
            label: "Référence",
            sortValue: (r) => r.produitReference,
            render: (r) => r.produitReference,
          },
          {
            key: "source",
            label: "Source",
            render: (r) =>
              r.sourceType === "BL_LIGNE" ? "BL achat" : "Stock historique",
          },
          {
            key: "quantity",
            label: "Quantité vendue",
            numeric: true,
            sortValue: (r) => r.qteVendue,
            render: (r) => r.qteVendue.toLocaleString("fr-TN"),
          },
          {
            key: "uncovered",
            label: "Non couverte",
            numeric: true,
            sortValue: (r) => r.qteNonCouverte,
            render: (r) => (
              <span
                className={
                  r.qteNonCouverte > 0 ? "text-amber-800 font-semibold" : ""
                }
              >
                {r.qteNonCouverte.toLocaleString("fr-TN")}
              </span>
            ),
          },
          {
            key: "unit",
            label: "Prix unitaire TTC",
            numeric: true,
            sortValue: (r) => r.prixVenteTtc,
            render: (r) => formatDinar(r.prixVenteTtc),
          },
          {
            key: "total",
            label: "Total TTC",
            numeric: true,
            sortValue: (r) => r.prixVenteTotalTtc,
            render: (r) => formatDinar(r.prixVenteTotalTtc),
          },
        ]}
      />
    </div>
  );
}

export default function TransactionsPage() {
  const [tab, setTab] = useState<"achats" | "ventes">("achats");
  const [achatModalOpen, setAchatModalOpen] = useState(false);
  const [venteModalOpen, setVenteModalOpen] = useState(false);
  const [editBl, setEditBl] = useState<BlAchat | null>(null);
  const [editVente, setEditVente] = useState<Vente | null>(null);
  const [deleteBlId, setDeleteBlId] = useState<string | null>(null);
  const [deleteBlError, setDeleteBlError] = useState<string | null>(null);
  const [deleteVenteId, setDeleteVenteId] = useState<string | null>(null);
  const [deleteVenteError, setDeleteVenteError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterMagasinId, setFilterMagasinId] = useState("");
  const [filterFournisseurId, setFilterFournisseurId] = useState("");
  const table = useTableState("date", "desc");
  const { page, setPage } = table;
  const [hasDepassement, setHasDepassement] = useState(""),
    [consumed, setConsumed] = useState("");
  const [exportScope, setExportScope] = useState("filtered");
  const [inspection, setInspection] = useState<
    { kind: "achats"; data: BlAchat } | { kind: "ventes"; data: Vente } | null
  >(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, setPage]);

  const {
    data: blData,
    isLoading: blLoading,
    isFetching: blFetching,
    error: blError,
  } = useQuery({
    queryKey: [
      "bl-achats",
      page,
      table.size,
      table.sortBy,
      table.sortDirection,
      search,
      dateFrom,
      dateTo,
      filterMagasinId,
      filterFournisseurId,
      consumed,
    ],
    queryFn: () =>
      listBlAchats({
        page,
        size: table.size,
        sortBy: table.sortBy,
        sortDirection: table.sortDirection,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        magasinId: filterMagasinId || undefined,
        fournisseurId: filterFournisseurId || undefined,
        consumed: (consumed as "yes" | "no") || undefined,
      }),
    placeholderData: keepPreviousData,
    enabled: tab === "achats",
  });

  const {
    data: venteData,
    isLoading: venteLoading,
    isFetching: venteFetching,
    error: venteError,
  } = useQuery({
    queryKey: [
      "ventes",
      page,
      table.size,
      table.sortBy,
      table.sortDirection,
      search,
      dateFrom,
      dateTo,
      filterMagasinId,
      hasDepassement,
    ],
    queryFn: () =>
      listVentes({
        hasDepassement: hasDepassement ? hasDepassement === "true" : undefined,
        page,
        size: table.size,
        sortBy: table.sortBy,
        sortDirection: table.sortDirection,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        magasinId: filterMagasinId || undefined,
      }),
    placeholderData: keepPreviousData,
    enabled: tab === "ventes",
  });

  const deleteBlMutation = useMutation({
    mutationFn: deleteBlAchat,
    onSuccess: () => {
      invalidateAll(qc);
      setDeleteBlId(null);
      setDeleteBlError(null);
      setPage(0);
    },
    onError: (err) => {
      setDeleteBlError(
        hasApiErrorCode(err, BL_ACHAT_HAS_VENTES)
          ? "Impossible de supprimer ce BL : une vente a déjà été enregistrée à partir de ses lignes."
          : "Erreur lors de la suppression.",
      );
    },
  });
  const deleteVenteMutation = useMutation({
    mutationFn: deleteVente,
    onSuccess: () => {
      invalidateAll(qc);
      setDeleteVenteId(null);
      setDeleteVenteError(null);
      setPage(0);
    },
    onError: () => setDeleteVenteError("Erreur lors de la suppression."),
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      exportExcel(
        exportScope === "all"
          ? {}
          : {
              type: tab,
              search: search || undefined,
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
              magasinId: filterMagasinId || undefined,
              ...(tab === "achats"
                ? {
                    fournisseurId: filterFournisseurId || undefined,
                    consumed: (consumed as "yes" | "no") || undefined,
                  }
                : {
                    hasDepassement: hasDepassement
                      ? hasDepassement === "true"
                      : undefined,
                  }),
            },
      ),
  });

  const blAchats: BlAchat[] = blData?.content ?? [];
  const ventes: Vente[] = venteData?.content ?? [];

  return (
    <div className="max-w-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Saisie des Transactions
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Achats (BL multi-produits) et ventes (stock auto-prélevé)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAchatModalOpen(true)}>
            <Plus size={16} /> Nouveau BL achat
          </Button>
          <Button variant="secondary" onClick={() => setVenteModalOpen(true)}>
            <Plus size={16} /> Nouvelle Vente
          </Button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => {
            setTab("achats");
            setSearchInput("");
            setSearch("");
            setPage(0);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "achats"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Achats
        </button>
        <button
          onClick={() => {
            setTab("ventes");
            setSearchInput("");
            setSearch("");
            setPage(0);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "ventes"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Ventes
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            aria-label="Rechercher des transactions"
            placeholder={
              tab === "achats"
                ? "Rechercher par N° BL..."
                : "Rechercher par référence/désignation produit..."
            }
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <DateRange
          from={dateFrom}
          to={dateTo}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
            setPage(0);
          }}
        />
        <div className="w-56">
          <SearchSelect
            label="Magasin"
            value={filterMagasinId}
            onChange={(id) => {
              setFilterMagasinId(id);
              setPage(0);
            }}
            onSearch={lookupMagasins}
            queryKey="magasins"
            getId={(m) => m.id}
            getLabel={(m) => m.label}
            placeholder="Tous les magasins"
          />
        </div>
        {tab === "achats" && (
          <div className="w-56">
            <SearchSelect
              label="Fournisseur"
              value={filterFournisseurId}
              onChange={(id) => {
                setFilterFournisseurId(id);
                setPage(0);
              }}
              onSearch={lookupFournisseurs}
              queryKey="fournisseurs"
              getId={(f) => f.id}
              getLabel={(f) => f.label}
              placeholder="Tous les fournisseurs"
            />
          </div>
        )}
        <Select
          label={
            tab === "achats" ? "Consommation du BL" : "Dépassement de stock"
          }
          value={tab === "achats" ? consumed : hasDepassement}
          onChange={(e) => {
            if (tab === "achats") setConsumed(e.target.value);
            else setHasDepassement(e.target.value);
            setPage(0);
          }}
          options={
            tab === "achats"
              ? [
                  { value: "", label: "Tous les BL" },
                  { value: "yes", label: "Déjà consommés" },
                  { value: "no", label: "Non consommés" },
                ]
              : [
                  { value: "", label: "Toutes les ventes" },
                  { value: "true", label: "Avec dépassement" },
                  { value: "false", label: "Sans dépassement" },
                ]
          }
        />
        {(consumed ||
          hasDepassement ||
          search ||
          dateFrom ||
          dateTo ||
          filterMagasinId ||
          filterFournisseurId) && (
          <button
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setDateFrom("");
              setDateTo("");
              setFilterMagasinId("");
              setFilterFournisseurId("");
              setConsumed("");
              setHasDepassement("");
              setPage(0);
            }}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <X size={14} /> Effacer filtres
          </button>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4 mb-4 flex flex-wrap items-end gap-3">
        <Select
          label="Portée de l’export"
          value={exportScope}
          onChange={(e) => setExportScope(e.target.value)}
          options={[
            {
              value: "filtered",
              label: tab === "achats" ? "Achats filtrés" : "Ventes filtrées",
            },
            { value: "all", label: "Tout — achats et ventes sans filtre" },
          ]}
        />
        <Button
          variant="secondary"
          onClick={() => exportMutation.mutate()}
          loading={exportMutation.isPending}
        >
          <Download size={16} /> Exporter Excel
        </Button>
        <p className="text-xs text-gray-500 max-w-lg">
          {exportScope === "all"
            ? "Toutes les transactions, sans les filtres affichés, dans deux feuilles Excel."
            : "Tous les résultats correspondant aux filtres de l’onglet actif, au-delà de la page affichée."}
        </p>
      </div>
      <ApiErrorBanner error={exportMutation.error} />
      {tab === "achats" ? (
        <DataTable
          label="BL achats"
          rows={blAchats}
          rowKey={(r) => r.id}
          total={blData?.page.totalElements ?? 0}
          state={table}
          loading={blLoading}
          busy={blFetching}
          error={blError}
          columns={[
            {
              key: "date",
              label: "Date",
              sortable: true,
              render: (r) => formatDate(r.transactionDate),
            },
            { key: "magasin", label: "Magasin", render: (r) => r.magasinNom },
            {
              key: "fournisseur",
              label: "Fournisseur",
              render: (r) => r.fournisseurNom,
            },
            {
              key: "blNumero",
              label: "N° BL",
              sortable: true,
              render: (r) => r.blNumero,
            },
            {
              key: "lines",
              label: "Produits",
              render: (r) => (
                <LineSummary
                  lines={r.lignes}
                  onOpen={() => setInspection({ kind: "achats", data: r })}
                />
              ),
            },
            {
              key: "total",
              label: "Total TTC",
              numeric: true,
              render: (r) =>
                formatDinar(
                  r.lignes.reduce((n, l) => n + l.prixAchatTotalTtc, 0),
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
                    onClick={() => setInspection({ kind: "achats", data: r })}
                  >
                    Voir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditBl(r)}
                  >
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteBlId(r.id)}
                  >
                    Supprimer
                  </Button>
                </div>
              ),
            },
          ]}
        />
      ) : (
        <DataTable
          label="Ventes"
          rows={ventes}
          rowKey={(r) => r.id}
          total={venteData?.page.totalElements ?? 0}
          state={table}
          loading={venteLoading}
          busy={venteFetching}
          error={venteError}
          columns={[
            {
              key: "date",
              label: "Date",
              sortable: true,
              render: (r) => formatDate(r.venteDate),
            },
            { key: "magasin", label: "Magasin", render: (r) => r.magasinNom },
            {
              key: "lines",
              label: "Produits",
              render: (r) => (
                <LineSummary
                  lines={r.lignes}
                  onOpen={() => setInspection({ kind: "ventes", data: r })}
                />
              ),
            },
            {
              key: "total",
              label: "Total TTC",
              numeric: true,
              render: (r) => formatDinar(r.totalTtc),
            },
            {
              key: "alert",
              label: "Stock",
              render: (r) =>
                r.hasDepassement ? (
                  <Badge className="bg-amber-50 text-amber-900">
                    Dépassement
                  </Badge>
                ) : (
                  <span className="text-gray-500">Couvert</span>
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
                    onClick={() => setInspection({ kind: "ventes", data: r })}
                  >
                    Voir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditVente(r)}
                  >
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteVenteId(r.id)}
                  >
                    Supprimer
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
      <Modal
        open={!!inspection}
        onClose={() => setInspection(null)}
        title={
          inspection?.kind === "achats"
            ? "Détail du BL achat"
            : "Détail de la vente"
        }
        size="xl"
      >
        {inspection && <TransactionDetail inspection={inspection} />}
      </Modal>

      <Modal
        open={achatModalOpen}
        onClose={() => setAchatModalOpen(false)}
        title="Nouveau BL Achat"
        size="xl"
      >
        {achatModalOpen && (
          <BlAchatForm onClose={() => setAchatModalOpen(false)} />
        )}
      </Modal>

      <Modal
        open={venteModalOpen}
        onClose={() => setVenteModalOpen(false)}
        title="Nouvelle Vente"
        size="xl"
      >
        {venteModalOpen && (
          <VenteForm onClose={() => setVenteModalOpen(false)} />
        )}
      </Modal>

      <Modal
        open={editBl !== null}
        onClose={() => setEditBl(null)}
        title="Modifier le BL Achat"
        size="xl"
      >
        {editBl && (
          <BlAchatEditForm onClose={() => setEditBl(null)} bl={editBl} />
        )}
      </Modal>

      <Modal
        open={editVente !== null}
        onClose={() => setEditVente(null)}
        title="Modifier la Vente"
        size="xl"
      >
        {editVente && (
          <VenteForm onClose={() => setEditVente(null)} initial={editVente} />
        )}
      </Modal>

      <ConfirmDialog
        open={deleteBlId !== null}
        onClose={() => {
          setDeleteBlId(null);
          setDeleteBlError(null);
        }}
        onConfirm={() =>
          deleteBlId !== null && deleteBlMutation.mutate(deleteBlId)
        }
        loading={deleteBlMutation.isPending}
        error={deleteBlError}
        message="Voulez-vous supprimer ce BL ? Cette action est irréversible. Impossible si une vente y est déjà rattachée."
      />
      <ConfirmDialog
        open={deleteVenteId !== null}
        onClose={() => {
          setDeleteVenteId(null);
          setDeleteVenteError(null);
        }}
        onConfirm={() =>
          deleteVenteId !== null && deleteVenteMutation.mutate(deleteVenteId)
        }
        loading={deleteVenteMutation.isPending}
        error={deleteVenteError}
        message="Voulez-vous vraiment supprimer cette vente ? Cette action est définitive et irréversible."
      />
    </div>
  );
}
