'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  listFournisseurs,
  createFournisseur,
  updateFournisseur,
  deleteFournisseur,
} from '@/features/fournisseurs/services/fournisseurService';
import { fournisseurSchema, FournisseurInput } from '@/lib/validations';
import { Fournisseur } from '@/types';
import { extractApiErrorMessage } from '@/types/api';
import { PAGE_SIZE } from '@/lib/constants';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import EmptyState from '@/components/shared/EmptyState';
import ApiErrorBanner from '@/components/shared/ApiErrorBanner';

function FournisseurForm({ onClose, initial }: { onClose: () => void; initial?: Fournisseur }) {
  const qc = useQueryClient();
  const isEditing = !!initial;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FournisseurInput>({
    resolver: zodResolver(fournisseurSchema),
    defaultValues: initial
      ? {
          code: initial.code,
          nom: initial.nom,
          adresse: initial.adresse ?? '',
          telephone: initial.telephone ?? '',
          email: initial.email ?? '',
          contactPrincipal: initial.contactPrincipal ?? '',
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (data: FournisseurInput) =>
      isEditing
        ? updateFournisseur(initial!.id, {
            nom: data.nom,
            adresse: data.adresse,
            telephone: data.telephone,
            email: data.email,
            contactPrincipal: data.contactPrincipal,
          })
        : createFournisseur(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fournisseurs'] });
      onClose();
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="code"
          label="Code *"
          placeholder="Code fournisseur"
          error={errors.code?.message}
          disabled={isEditing}
          {...register('code')}
        />
        <Input id="nom" label="Nom *" placeholder="Nom du fournisseur" error={errors.nom?.message} {...register('nom')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="telephone"
          label="Téléphone"
          placeholder="+216 71 234 567"
          error={errors.telephone?.message}
          {...register('telephone')}
        />
        <Input id="email" label="Email" placeholder="contact@fournisseur.tn" error={errors.email?.message} {...register('email')} />
      </div>
      <Input id="adresse" label="Adresse" placeholder="Adresse complète" error={errors.adresse?.message} {...register('adresse')} />
      <Input
        id="contactPrincipal"
        label="Contact principal"
        placeholder="Nom du contact"
        error={errors.contactPrincipal?.message}
        {...register('contactPrincipal')}
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

export default function FournisseursPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Fournisseur | null>(null);
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

  const { data, isLoading } = useQuery({
    queryKey: ['fournisseurs', page, search],
    queryFn: () => listFournisseurs({ page, size: PAGE_SIZE, search: search || undefined }),
    placeholderData: keepPreviousData,
  });

  const fournisseurs = data?.content ?? [];
  const meta = data?.page;

  const deleteMutation = useMutation({
    mutationFn: deleteFournisseur,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fournisseurs'] });
      setDeleteId(null);
      setDeleteError(null);
    },
    onError: (err) => setDeleteError(extractApiErrorMessage(err, 'Erreur lors de la suppression.')),
  });

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (f: Fournisseur) => {
    setEditing(f);
    setModalOpen(true);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fournisseurs</h1>
          <p className="text-gray-500 text-sm mt-1">Gestion des fournisseurs actifs.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={16} /> Ajouter Fournisseur
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Rechercher un fournisseur..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : fournisseurs.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="text-left px-5 py-3">Code</th>
                <th className="text-left px-5 py-3">Nom</th>
                <th className="text-left px-5 py-3">Téléphone</th>
                <th className="text-left px-5 py-3">Adresse</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fournisseurs.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-sm font-medium text-gray-700">{f.code}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{f.nom}</td>
                  <td className="px-5 py-3 text-gray-600">{f.telephone ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{f.adresse ?? '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button className="text-gray-400 hover:text-blue-600 transition-colors" onClick={() => openEdit(f)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        onClick={() => setDeleteId(f.id)}
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
            {meta.totalElements} fournisseurs · page {meta.page + 1} sur {meta.totalPages}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le Fournisseur' : 'Ajouter un Fournisseur'}>
        {modalOpen && <FournisseurForm onClose={() => setModalOpen(false)} initial={editing ?? undefined} />}
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
