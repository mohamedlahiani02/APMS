'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { invalidateReference } from '@/lib/api/cache';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  listProduits,
  createProduit,
  updateProduit,
  deleteProduit,
} from '@/features/produits/services/produitService';
import { lookupFamilles } from '@/features/familles/services/familleService';
import { produitSchema, ProduitInput } from '@/lib/validations';
import { familleBadgeColor, PAGE_SIZE } from '@/lib/constants';
import { Produit } from '@/types';
import { extractApiErrorMessage } from '@/types/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SearchSelect from '@/components/ui/SearchSelect';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import EmptyState from '@/components/shared/EmptyState';
import ApiErrorBanner from '@/components/shared/ApiErrorBanner';

function ProduitForm({ onClose, initial }: { onClose: () => void; initial?: Produit }) {
  const qc = useQueryClient();
  const isEditing = !!initial;
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProduitInput>({
    resolver: zodResolver(produitSchema),
    defaultValues: initial
      ? { reference: initial.reference, designation: initial.designation, familleId: initial.familleId }
      : undefined,
  });

  const familleId = useWatch({ control, name: 'familleId' });

  const mutation = useMutation({
    mutationFn: (data: ProduitInput) =>
      isEditing
        ? updateProduit(initial!.id, { designation: data.designation, familleId: data.familleId })
        : createProduit(data),
    onSuccess: () => {
      invalidateReference(qc, 'produits');
      onClose();
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="reference"
          label="Référence *"
          placeholder="Référence produit"
          error={errors.reference?.message}
          readOnly={isEditing}
          {...register('reference')}
        />
        <Input
          id="designation"
          label="Désignation *"
          placeholder="Nom du produit"
          error={errors.designation?.message}
          {...register('designation')}
        />
      </div>
      <SearchSelect
        label="Famille *"
        value={familleId ?? ''}
        onChange={(id) => setValue('familleId', id, { shouldValidate: true })}
        onSearch={(q) => lookupFamilles(q)}
        queryKey="familles"
        initialLabel={initial ? initial.familleNom : undefined}
        getId={(f) => f.id}
        getLabel={(f) => `${f.code} — ${f.label}`}
        placeholder="Rechercher une famille..."
        error={errors.familleId?.message}
      />
      <ApiErrorBanner error={mutation.error} />
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          {isEditing ? 'Modifier' : 'Ajouter'}
        </Button>
      </div>
    </form>
  );
}

export default function ProduitsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Produit | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterFamille, setFilterFamille] = useState('');
  const [page, setPage] = useState(0);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['produits', page, filterFamille, search],
    queryFn: () =>
      listProduits({
        page,
        size: PAGE_SIZE,
        familleId: filterFamille || undefined,
        search: search || undefined,
      }),
    placeholderData: keepPreviousData,
  });


  const produits = data?.content ?? [];
  const meta = data?.page;

  const deleteMutation = useMutation({
    mutationFn: deleteProduit,
    onSuccess: () => {
      invalidateReference(qc, 'produits');
      setDeleteId(null);
      setDeleteError(null);
    },
    onError: (err) => setDeleteError(extractApiErrorMessage(err, 'Erreur lors de la suppression.')),
  });

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (p: Produit) => {
    setEditing(p);
    setModalOpen(true);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produits</h1>
          <p className="text-gray-500 text-sm mt-1">
            Référentiel des articles{meta ? ` — ${meta.totalElements} produits` : ''}.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={16} /> Ajouter Produit
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Rechercher par référence ou désignation..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="w-64"><SearchSelect
          value={filterFamille}
          onChange={id => { setFilterFamille(id); setPage(0); }}
          onSearch={lookupFamilles}
          queryKey="familles"
          getId={f => f.id}
          getLabel={f => f.label}
          placeholder="Toutes les familles"
        /></div>
      </div>

      <ApiErrorBanner error={error} />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : produits.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="text-left px-5 py-3">Référence</th>
                <th className="text-left px-5 py-3">Désignation</th>
                <th className="text-left px-5 py-3">Famille</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {produits.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-sm text-gray-700">{p.reference}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{p.designation}</td>
                  <td className="px-5 py-3">
                    <Badge className={familleBadgeColor(p.familleNom)}>{p.familleNom}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button className="text-gray-400 hover:text-blue-600 transition-colors" onClick={() => openEdit(p)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        onClick={() => setDeleteId(p.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            page {meta.page + 1} sur {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={meta.page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Précédent
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={meta.page + 1 >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le Produit' : 'Ajouter un Produit'}>
        {modalOpen && <ProduitForm onClose={() => setModalOpen(false)} initial={editing ?? undefined} />}
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => {
          setDeleteId(null);
          setDeleteError(null);
        }}
        onConfirm={() => deleteId !== null && deleteMutation.mutate(deleteId)}
        loading={deleteMutation.isPending}
        error={deleteError}
      />
    </div>
  );
}
