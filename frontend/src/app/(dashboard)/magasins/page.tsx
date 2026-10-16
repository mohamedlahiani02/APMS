'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { invalidateReference } from '@/lib/api/cache';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  listMagasins,
  createMagasin,
  updateMagasin,
  deleteMagasin,
} from '@/features/magasins/services/magasinService';
import { magasinSchema, MagasinInput } from '@/lib/validations';
import { Magasin } from '@/types';
import { extractApiErrorMessage } from '@/types/api';
import { PAGE_SIZE } from '@/lib/constants';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import EmptyState from '@/components/shared/EmptyState';
import ApiErrorBanner from '@/components/shared/ApiErrorBanner';

function MagasinForm({ onClose, initial }: { onClose: () => void; initial?: Magasin }) {
  const qc = useQueryClient();
  const isEditing = !!initial;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MagasinInput>({
    resolver: zodResolver(magasinSchema),
    defaultValues: initial
      ? {
          code: initial.code,
          nom: initial.nom,
          adresse: initial.adresse ?? '',
          ville: initial.ville ?? '',
          telephone: initial.telephone ?? '',
          responsable: initial.responsable ?? '',
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (data: MagasinInput) =>
      isEditing
        ? updateMagasin(initial!.id, {
            nom: data.nom,
            adresse: data.adresse,
            ville: data.ville,
            telephone: data.telephone,
            responsable: data.responsable,
          })
        : createMagasin(data),
    onSuccess: () => {
      invalidateReference(qc, 'magasins');
      onClose();
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="code"
          label="Code *"
          placeholder="Code magasin"
          error={errors.code?.message}
          readOnly={isEditing}
          {...register('code')}
        />
        <Input id="nom" label="Nom *" placeholder="Nom du magasin" error={errors.nom?.message} {...register('nom')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input id="ville" label="Ville" placeholder="Ville" error={errors.ville?.message} {...register('ville')} />
        <Input
          id="telephone"
          label="Téléphone"
          placeholder="+216 71 234 567"
          error={errors.telephone?.message}
          {...register('telephone')}
        />
      </div>
      <Input id="adresse" label="Adresse" placeholder="Adresse du magasin" error={errors.adresse?.message} {...register('adresse')} />
      <Input
        id="responsable"
        label="Responsable"
        placeholder="Nom du responsable"
        error={errors.responsable?.message}
        {...register('responsable')}
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

export default function MagasinsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Magasin | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
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
    queryKey: ['magasins', page, search],
    queryFn: () => listMagasins({ page, size: PAGE_SIZE, search: search || undefined }),
    placeholderData: keepPreviousData,
  });

  const magasins = data?.content ?? [];
  const meta = data?.page;

  const deleteMutation = useMutation({
    mutationFn: deleteMagasin,
    onSuccess: () => {
      invalidateReference(qc, 'magasins');
      setDeleteId(null);
      setDeleteError(null);
    },
    onError: (err) => setDeleteError(extractApiErrorMessage(err, 'Erreur lors de la suppression.')),
  });

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (m: Magasin) => {
    setEditing(m);
    setModalOpen(true);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Magasins</h1>
          <p className="text-gray-500 text-sm mt-1">Gestion des magasins et points de stockage.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={16} /> Ajouter Magasin
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Rechercher un magasin..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <ApiErrorBanner error={error} />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : magasins.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="text-left px-5 py-3">Code</th>
                <th className="text-left px-5 py-3">Nom</th>
                <th className="text-left px-5 py-3">Ville</th>
                <th className="text-left px-5 py-3">Adresse</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {magasins.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-sm font-medium text-gray-700">{m.code}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{m.nom}</td>
                  <td className="px-5 py-3 text-gray-600">{m.ville ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{m.adresse ?? '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button className="text-gray-400 hover:text-blue-600 transition-colors" onClick={() => openEdit(m)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        onClick={() => setDeleteId(m.id)}
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
            {meta.totalElements} magasins · page {meta.page + 1} sur {meta.totalPages}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le Magasin' : 'Ajouter un Magasin'}>
        {modalOpen && <MagasinForm onClose={() => setModalOpen(false)} initial={editing ?? undefined} />}
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
