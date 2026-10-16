'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, X, Trash2, Pencil, Download } from 'lucide-react';

import {
  listBlAchats,
  createBlAchat,
  updateBlAchat,
  deleteBlAchat,
} from '@/features/bl-achats/services/blAchatService';
import { listVentes, createVente, updateVente, deleteVente } from '@/features/ventes/services/venteService';
import { exportExcel } from '@/features/transactions/services/transactionService';
import { lookupFournisseurs } from '@/features/fournisseurs/services/fournisseurService';
import { lookupMagasins } from '@/features/magasins/services/magasinService';
import { lookupProduits } from '@/features/produits/services/produitService';
import { blAchatSchema, BlAchatInput, venteSchema, VenteInput } from '@/lib/validations';
import { formatDinar, formatDate, todayISO } from '@/utils';
import { PAGE_SIZE, TVA_RATES } from '@/lib/constants';
import type { BlAchat, Vente } from '@/types';
import { hasApiErrorCode } from '@/types/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SearchSelect from '@/components/ui/SearchSelect';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import EmptyState from '@/components/shared/EmptyState';
import ApiErrorBanner from '@/components/shared/ApiErrorBanner';

const BL_ACHAT_HAS_VENTES = 'BL_ACHAT_HAS_VENTES';

// Invalidates every query that depends on achat/vente data, in one place, so
// dashboard/bilan/stock never go stale after a mutation.
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['transactions'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['bilan'] });
  qc.invalidateQueries({ queryKey: ['stock'] });
  qc.invalidateQueries({ queryKey: ['bl-achats'] });
  qc.invalidateQueries({ queryKey: ['ventes'] });
  qc.invalidateQueries({ queryKey: ['analytics'] });
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
  watch: ReturnType<typeof useForm<BlAchatInput>>['watch'];
  setValue: ReturnType<typeof useForm<BlAchatInput>>['setValue'];
  register: ReturnType<typeof useForm<BlAchatInput>>['register'];
  errors: ReturnType<typeof useForm<BlAchatInput>>['formState']['errors'];
  remove: (idx: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-start bg-white rounded-lg p-3">
      <SearchSelect
        label="Produit *"
        initialLabel={initialLabel}
        value={watch(`lignes.${idx}.produitId`)}
        onChange={(id) => setValue(`lignes.${idx}.produitId`, id, { shouldValidate: true })}
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
        <label className="text-sm font-medium text-gray-700">TVA *</label>
        <select
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
  register: ReturnType<typeof useForm<BlAchatInput>>['register'];
  errors: ReturnType<typeof useForm<BlAchatInput>>['formState']['errors'];
  watch: ReturnType<typeof useForm<BlAchatInput>>['watch'];
  setValue: ReturnType<typeof useForm<BlAchatInput>>['setValue'];
  initial?: BlAchat;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Input id="transactionDate" label="Date *" type="date" error={errors.transactionDate?.message} {...register('transactionDate')} />
      <SearchSelect
        label="Magasin *"
        value={watch('magasinId')}
        onChange={(id) => setValue('magasinId', id, { shouldValidate: true })}
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
        value={watch('fournisseurId')}
        onChange={(id) => setValue('fournisseurId', id, { shouldValidate: true })}
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
      blNumero: '',
      magasinId: '',
      fournisseurId: '',
      lignes: [{ produitId: '', qteAchetee: 0, prixAchatNetHt: 0, tauxTva: 19 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lignes' });

  const mutation = useMutation({
    mutationFn: (data: BlAchatInput) => createBlAchat(data),
    onSuccess: () => {
      invalidateAll(qc);
      onClose();
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      <BlAchatHeaderFields register={register} errors={errors} watch={watch} setValue={setValue} />
      <Input id="blNumero" label="N° Bon de Livraison *" placeholder="BL-2026-XXXX" error={errors.blNumero?.message} {...register('blNumero')} />

      <div className="bg-blue-50 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-blue-800">Produits du BL</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => append({ produitId: '', qteAchetee: 0, prixAchatNetHt: 0, tauxTva: 19 })}
          >
            <Plus size={14} /> Ajouter une ligne
          </Button>
        </div>
        {errors.lignes?.message && <p className="text-xs text-red-600">{errors.lignes.message}</p>}
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
function BlAchatEditForm({ onClose, bl }: { onClose: () => void; bl: BlAchat }) {
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
  const { fields, append, remove } = useFieldArray({ control, name: 'lignes' });

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
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      <BlAchatHeaderFields register={register} errors={errors} watch={watch} setValue={setValue} initial={bl} />
      <Input id="blNumero" label="N° Bon de Livraison *" error={errors.blNumero?.message} {...register('blNumero')} />

      {locked ? (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Les produits de ce BL ne sont pas modifiables : au moins une vente utilise ce BL. Seuls les champs d&apos;en-tête
          (date, N° BL, magasin, fournisseur) restent modifiables. Créez un nouveau BL pour changer les produits.
        </p>
      ) : (
        <div className="bg-blue-50 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-blue-800">Produits du BL</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => append({ produitId: '', qteAchetee: 0, prixAchatNetHt: 0, tauxTva: 19 })}
            >
              <Plus size={14} /> Ajouter une ligne
            </Button>
          </div>
          {errors.lignes?.message && <p className="text-xs text-red-600">{errors.lignes.message}</p>}
          {fields.map((field, idx) => (
            <BlAchatLigneRow
              key={field.id}
              idx={idx}
              initialLabel={bl.lignes[idx] ? bl.lignes[idx].produitReference + " — " + bl.lignes[idx].produitDesignation : undefined}
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
          Une vente vient d’utiliser ce BL. Fermez puis rouvrez le formulaire pour modifier son en-tête.
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
  watch: ReturnType<typeof useForm<VenteInput>>['watch'];
  setValue: ReturnType<typeof useForm<VenteInput>>['setValue'];
  register: ReturnType<typeof useForm<VenteInput>>['register'];
  errors: ReturnType<typeof useForm<VenteInput>>['formState']['errors'];
  remove: (idx: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-start bg-white rounded-lg p-3">
      <SearchSelect
        label="Produit *"
        initialLabel={initialLabel}
        value={watch(`lignes.${idx}.produitId`)}
        onChange={(id) => setValue(`lignes.${idx}.produitId`, id, { shouldValidate: true })}
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

function VenteForm({ onClose, initial }: { onClose: () => void; initial?: Vente }) {
  const qc = useQueryClient();
  const isEditing = !!initial;

  const defaultLignes = initial
    ? Object.values(
        initial.lignes.reduce(
          (acc: Record<string, { produitId: string; qteVendue: number; prixVenteTtc: number }>, l) => {
            const g = (acc[l.produitId + ":" + l.prixVenteTtc] ??= { produitId: l.produitId, qteVendue: 0, prixVenteTtc: l.prixVenteTtc });
            g.qteVendue += l.qteVendue;
            return acc;
          },
          {}
        )
      )
    : [{ produitId: '', qteVendue: 1, prixVenteTtc: 0 }];

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
      magasinId: initial?.magasinId ?? '',
      lignes: defaultLignes,
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lignes' });
  const venteValues = useWatch({ control });

  const mutation = useMutation({
    mutationFn: (data: VenteInput) => (isEditing ? updateVente(initial!.id, data) : createVente(data)),
    onSuccess: () => {
      invalidateAll(qc);
      onClose();
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Input id="venteDate" label="Date *" type="date" error={errors.venteDate?.message} {...register('venteDate')} />
        <SearchSelect
          label="Magasin *"
          value={venteValues.magasinId ?? ''}
          onChange={(id) => setValue('magasinId', id, { shouldValidate: true })}
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
          <p className="text-sm font-semibold text-green-800">Produits vendus</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => append({ produitId: '', qteVendue: 1, prixVenteTtc: 0 })}>
            <Plus size={14} /> Ajouter une ligne
          </Button>
        </div>
        {errors.lignes?.message && <p className="text-xs text-red-600">{errors.lignes.message}</p>}
        {fields.map((field, idx) => (
          <VenteLigneRow
            key={field.id}
            idx={idx}
            initialLabel={initial?.lignes.find(l => l.produitId === venteValues.lignes?.[idx]?.produitId)?.produitReference}
            watch={watch}
            setValue={setValue}
            register={register}
            errors={errors}
            remove={remove}
            canRemove={fields.length > 1}
          />
        ))}
        <p className="text-xs text-green-800">
          La quantité est prélevée automatiquement sur le stock disponible (BL le plus ancien d&apos;abord, puis
          stock historique) — aucun lot à choisir. Un dépassement de stock ne bloque jamais la vente : il sera
          signalé après enregistrement.
        </p>
      </div>

      <ApiErrorBanner error={mutation.error} />

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          {isEditing ? 'Modifier la vente' : 'Enregistrer la vente'}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────
export default function TransactionsPage() {
  const [tab, setTab] = useState<'achats' | 'ventes'>('achats');
  const [achatModalOpen, setAchatModalOpen] = useState(false);
  const [venteModalOpen, setVenteModalOpen] = useState(false);
  const [editBl, setEditBl] = useState<BlAchat | null>(null);
  const [editVente, setEditVente] = useState<Vente | null>(null);
  const [deleteBlId, setDeleteBlId] = useState<string | null>(null);
  const [deleteBlError, setDeleteBlError] = useState<string | null>(null);
  const [deleteVenteId, setDeleteVenteId] = useState<string | null>(null);
  const [deleteVenteError, setDeleteVenteError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterMagasinId, setFilterMagasinId] = useState('');
  const [filterFournisseurId, setFilterFournisseurId] = useState('');
  const [page, setPage] = useState(0);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const {
    data: blData,
    isLoading: blLoading,
    isError: blIsError,
    error: blError,
  } = useQuery({
    queryKey: ['bl-achats', page, search, dateFrom, dateTo, filterMagasinId, filterFournisseurId],
    queryFn: () =>
      listBlAchats({
        page,
        size: PAGE_SIZE,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        magasinId: filterMagasinId || undefined,
        fournisseurId: filterFournisseurId || undefined,
      }),
    placeholderData: keepPreviousData,
    enabled: tab === 'achats',
  });

  const {
    data: venteData,
    isLoading: venteLoading,
    isError: venteIsError,
    error: venteError,
  } = useQuery({
    queryKey: ['ventes', page, search, dateFrom, dateTo, filterMagasinId],
    queryFn: () =>
      listVentes({
        page,
        size: PAGE_SIZE,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        magasinId: filterMagasinId || undefined,
      }),
    placeholderData: keepPreviousData,
    enabled: tab === 'ventes',
  });

  const deleteBlMutation = useMutation({
    mutationFn: deleteBlAchat,
    onSuccess: () => {
      invalidateAll(qc);
      setDeleteBlId(null);
      setDeleteBlError(null);
    },
    onError: (err) => {
      setDeleteBlError(
        hasApiErrorCode(err, BL_ACHAT_HAS_VENTES)
          ? 'Impossible de supprimer ce BL : une vente a déjà été enregistrée à partir de ses lignes.'
          : 'Erreur lors de la suppression.'
      );
    },
  });
  const deleteVenteMutation = useMutation({
    mutationFn: deleteVente,
    onSuccess: () => {
      invalidateAll(qc);
      setDeleteVenteId(null);
      setDeleteVenteError(null);
    },
    onError: () => setDeleteVenteError('Erreur lors de la suppression.'),
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      exportExcel({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, magasinId: filterMagasinId || undefined }),
  });

  const blAchats: BlAchat[] = blData?.content ?? [];
  const ventes: Vente[] = venteData?.content ?? [];
  const meta = tab === 'achats' ? blData?.page : venteData?.page;

  return (
    <div className="max-w-full">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saisie des Transactions</h1>
          <p className="text-gray-500 text-sm mt-1">Achats (BL multi-produits) et ventes (stock auto-prélevé)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
            <Download size={16} /> Exporter tout (Excel)
          </Button>
          <Button onClick={() => setAchatModalOpen(true)}>
            <Plus size={16} /> Nouveau BL Achat
          </Button>
          <Button variant="secondary" onClick={() => setVenteModalOpen(true)}>
            <Plus size={16} /> Nouvelle Vente
          </Button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => {
            setTab('achats');
            setPage(0);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'achats' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Achats
        </button>
        <button
          onClick={() => {
            setTab('ventes');
            setPage(0);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'ventes' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Ventes
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder={tab === 'achats' ? 'Rechercher par N° BL...' : 'Rechercher par référence/désignation produit...'}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <input
          type="date"
          aria-label="Date de début"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(0);
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <input
          type="date"
          aria-label="Date de fin"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(0);
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <div className="w-56"><SearchSelect
          value={filterMagasinId}
          onChange={id => { setFilterMagasinId(id); setPage(0); }}
          onSearch={lookupMagasins}
          queryKey="magasins"
          getId={m => m.id}
          getLabel={m => m.label}
          placeholder="Tous les magasins"
        /></div>
        {tab === 'achats' && (
          <div className="w-56"><SearchSelect
            value={filterFournisseurId}
            onChange={id => { setFilterFournisseurId(id); setPage(0); }}
            onSearch={lookupFournisseurs}
            queryKey="fournisseurs"
            getId={f => f.id}
            getLabel={f => f.label}
            placeholder="Tous les fournisseurs"
          /></div>
        )}
        {(search || dateFrom || dateTo || filterMagasinId || filterFournisseurId) && (
          <button
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setDateFrom('');
              setDateTo('');
              setFilterMagasinId('');
              setFilterFournisseurId('');
              setPage(0);
            }}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <X size={14} /> Effacer filtres
          </button>
        )}
      </div>

      {(blIsError || venteIsError) && (
        <div className="mb-4">
          <ApiErrorBanner error={tab === 'achats' ? blError : venteError} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {tab === 'achats' ? (
          blLoading ? (
            <LoadingSpinner fullPage />
          ) : blIsError ? null : blAchats.length === 0 ? (
            <EmptyState description="Aucun BL trouvé." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Magasin</th>
                    <th className="text-left px-4 py-3">Fournisseur</th>
                    <th className="text-left px-4 py-3">BL N°</th>
                    <th className="text-left px-4 py-3">Lignes</th>
                    <th className="text-right px-4 py-3">Total TTC</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {blAchats.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{formatDate(b.transactionDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{b.magasinNom}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{b.fournisseurNom}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{b.blNumero}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {b.lignes.map((l) => `${l.produitReference} ×${l.qteAchetee}`).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatDinar(b.lignes.reduce((s, l) => s + l.prixAchatTotalTtc, 0))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button className="text-gray-400 hover:text-gray-700 transition-colors" onClick={() => setEditBl(b)}>
                            <Pencil size={14} />
                          </button>
                          <button className="text-gray-400 hover:text-red-600 transition-colors" onClick={() => setDeleteBlId(b.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : venteLoading ? (
          <LoadingSpinner fullPage />
        ) : venteIsError ? null : ventes.length === 0 ? (
          <EmptyState description="Aucune vente trouvée." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Magasin</th>
                  <th className="text-left px-4 py-3">Lignes</th>
                  <th className="text-right px-4 py-3">Total TTC</th>
                  <th className="text-center px-4 py-3">Alerte</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventes.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDate(v.venteDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{v.magasinNom}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {v.lignes.map((l) => `${l.produitReference} ×${l.qteVendue}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">{formatDinar(v.totalTtc)}</td>
                    <td className="px-4 py-3 text-center">
                      {v.hasDepassement && <Badge className="bg-amber-100 text-amber-800">Dépassement</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button className="text-gray-400 hover:text-gray-700 transition-colors" onClick={() => setEditVente(v)}>
                          <Pencil size={14} />
                        </button>
                        <button className="text-gray-400 hover:text-red-600 transition-colors" onClick={() => setDeleteVenteId(v.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            {meta.totalElements} · page {meta.page + 1} sur {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" type="button" disabled={meta.page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Précédent
            </Button>
            <Button variant="secondary" type="button" disabled={meta.page + 1 >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Suivant
            </Button>
          </div>
        </div>
      )}

      <Modal open={achatModalOpen} onClose={() => setAchatModalOpen(false)} title="Nouveau BL Achat" size="xl">
        {achatModalOpen && <BlAchatForm onClose={() => setAchatModalOpen(false)} />}
      </Modal>

      <Modal open={venteModalOpen} onClose={() => setVenteModalOpen(false)} title="Nouvelle Vente" size="xl">
        {venteModalOpen && <VenteForm onClose={() => setVenteModalOpen(false)} />}
      </Modal>

      <Modal open={editBl !== null} onClose={() => setEditBl(null)} title="Modifier le BL Achat" size="xl">
        {editBl && <BlAchatEditForm onClose={() => setEditBl(null)} bl={editBl} />}
      </Modal>

      <Modal open={editVente !== null} onClose={() => setEditVente(null)} title="Modifier la Vente" size="xl">
        {editVente && <VenteForm onClose={() => setEditVente(null)} initial={editVente} />}
      </Modal>

      <ConfirmDialog
        open={deleteBlId !== null}
        onClose={() => {
          setDeleteBlId(null);
          setDeleteBlError(null);
        }}
        onConfirm={() => deleteBlId !== null && deleteBlMutation.mutate(deleteBlId)}
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
        onConfirm={() => deleteVenteId !== null && deleteVenteMutation.mutate(deleteVenteId)}
        loading={deleteVenteMutation.isPending}
        error={deleteVenteError}
        message="Voulez-vous vraiment supprimer cette vente ? Cette action est définitive et irréversible."
      />
    </div>
  );
}
