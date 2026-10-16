'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Pencil, Trash2, KeyRound, LockOpen, Copy, Check } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  unlockUser,
  resetUserPassword,
} from '@/features/users/services/userService';
import { userCreateSchema, userUpdateSchema, UserCreateInput, UserUpdateInput } from '@/lib/validations';
import { User } from '@/types';
import { extractApiErrorMessage } from '@/types/api';
import { PAGE_SIZE } from '@/lib/constants';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime } from '@/utils';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PasswordInput from '@/components/ui/PasswordInput';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import EmptyState from '@/components/shared/EmptyState';
import ApiErrorBanner from '@/components/shared/ApiErrorBanner';

const ROLE_OPTIONS = [
  { value: 'SECRETAIRE', label: 'Secrétaire' },
  { value: 'ADMIN', label: 'Administrateur' },
];

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { role: 'SECRETAIRE' },
  });

  const mutation = useMutation({
    mutationFn: (data: UserCreateInput) =>
      createUser({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        password: data.password,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      <Input
        id="email"
        label="Email *"
        type="email"
        placeholder="utilisateur@exemple.tn"
        error={errors.email?.message}
        {...register('email')}
      />
      <div className="grid grid-cols-2 gap-4">
        <Input id="firstName" label="Prénom" placeholder="Prénom" error={errors.firstName?.message} {...register('firstName')} />
        <Input id="lastName" label="Nom" placeholder="Nom" error={errors.lastName?.message} {...register('lastName')} />
      </div>
      <Select id="role" label="Rôle *" options={ROLE_OPTIONS} error={errors.role?.message} {...register('role')} />
      <div className="flex flex-col gap-1">
        <PasswordInput
          id="password"
          label="Mot de passe *"
          placeholder="Mot de passe temporaire"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <p className="text-xs text-gray-500">L&apos;utilisateur devra changer ce mot de passe à sa première connexion.</p>
      </div>
      <ApiErrorBanner error={mutation.error} />
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Ajouter
        </Button>
      </div>
    </form>
  );
}

function EditUserForm({ onClose, initial }: { onClose: () => void; initial: User }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserUpdateInput>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      firstName: initial.firstName ?? '',
      lastName: initial.lastName ?? '',
      role: initial.role,
      isActive: initial.isActive,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: UserUpdateInput) =>
      updateUser(initial.id, {
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        isActive: data.isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      <Input id="email" label="Email" value={initial.email} disabled readOnly />
      <div className="grid grid-cols-2 gap-4">
        <Input id="firstName" label="Prénom" placeholder="Prénom" error={errors.firstName?.message} {...register('firstName')} />
        <Input id="lastName" label="Nom" placeholder="Nom" error={errors.lastName?.message} {...register('lastName')} />
      </div>
      <Select id="role" label="Rôle *" options={ROLE_OPTIONS} error={errors.role?.message} {...register('role')} />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" {...register('isActive')} className="rounded" />
        Compte actif
      </label>
      <ApiErrorBanner error={mutation.error} />
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Modifier
        </Button>
      </div>
    </form>
  );
}

function TempPasswordModal({ open, password, onClose }: { open: boolean; password: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Mot de passe temporaire" size="sm">
      <p className="text-sm text-gray-600 mb-3">
        Le mot de passe a été réinitialisé. Communiquez-le à l&apos;utilisateur — il devra le changer à la prochaine
        connexion.
      </p>
      <div className="flex items-center gap-2 mb-3">
        <code className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 select-all">
          {password ?? ''}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          title="Copier"
        >
          {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
        </button>
      </div>
      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
        Ce mot de passe ne sera plus affiché. Toutes les sessions de cet utilisateur ont été révoquées.
      </p>
      <div className="flex justify-end">
        <Button onClick={onClose}>Fermer</Button>
      </div>
    </Modal>
  );
}

export default function UtilisateursPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const [modalMode, setModalMode] = useState<null | 'create' | 'edit'>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
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
    queryKey: ['users', page, search],
    queryFn: () => listUsers({ page, size: PAGE_SIZE, search: search || undefined }),
    placeholderData: keepPreviousData,
    enabled: user?.role === 'ADMIN',
  });

  const users = data?.content ?? [];
  const meta = data?.page;

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeleteId(null);
      setDeleteError(null);
    },
    onError: (err) => setDeleteError(extractApiErrorMessage(err, 'Erreur lors de la suppression.')),
  });

  const unlockMutation = useMutation({
    mutationFn: unlockUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setUnlockId(null);
      setUnlockError(null);
    },
    onError: (err) => setUnlockError(extractApiErrorMessage(err, 'Erreur lors du déverrouillage.')),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => resetUserPassword(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setResetId(null);
      setResetError(null);
      setTempPassword(res.temporaryPassword);
    },
    onError: (err) => setResetError(extractApiErrorMessage(err, 'Erreur lors de la réinitialisation.')),
  });

  const openAdd = () => {
    setEditing(null);
    setModalMode('create');
  };
  const openEdit = (u: User) => {
    setEditing(u);
    setModalMode('edit');
  };
  const closeModal = () => {
    setModalMode(null);
    setEditing(null);
  };

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
          <p className="text-gray-500 text-sm mt-1">Gestion des comptes administrateurs et secrétaires.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={16} /> Ajouter Utilisateur
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Rechercher par email ou nom..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <ApiErrorBanner error={error} />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : users.length === 0 ? (
          <EmptyState title="Aucun utilisateur" description="Cliquez sur « Ajouter Utilisateur » pour créer un compte." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="text-left px-5 py-3">Email</th>
                <th className="text-left px-5 py-3">Nom complet</th>
                <th className="text-left px-5 py-3">Rôle</th>
                <th className="text-left px-5 py-3">Statut</th>
                <th className="text-left px-5 py-3">Dernière connexion</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{u.email}</td>
                    <td className="px-5 py-3 text-gray-600">{fullName || '—'}</td>
                    <td className="px-5 py-3">
                      <Badge className={u.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-700'}>
                        {u.role === 'ADMIN' ? 'Administrateur' : 'Secrétaire'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {u.isActive ? (
                          <Badge className="bg-green-100 text-green-800">Actif</Badge>
                        ) : (
                          <Badge className="bg-gray-200 text-gray-700">Inactif</Badge>
                        )}
                        {u.mustChangePassword && <Badge className="bg-amber-100 text-amber-800">MDP à changer</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button className="text-gray-400 hover:text-blue-600 transition-colors" onClick={() => openEdit(u)} title="Modifier">
                          <Pencil size={15} />
                        </button>
                        <button
                          className="text-gray-400 hover:text-amber-600 transition-colors"
                          onClick={() => setResetId(u.id)}
                          title="Réinitialiser le mot de passe"
                        >
                          <KeyRound size={15} />
                        </button>
                        <button
                          className="text-gray-400 hover:text-green-600 transition-colors"
                          onClick={() => setUnlockId(u.id)}
                          title="Déverrouiller"
                        >
                          <LockOpen size={15} />
                        </button>
                        <button className="text-gray-400 hover:text-red-600 transition-colors" onClick={() => setDeleteId(u.id)} title="Supprimer">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            {meta.totalElements} utilisateurs · page {meta.page + 1} sur {meta.totalPages}
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

      <Modal open={modalMode !== null} onClose={closeModal} title={modalMode === 'edit' ? "Modifier l'utilisateur" : 'Ajouter un utilisateur'}>
        {modalMode === 'create' && <CreateUserForm onClose={closeModal} />}
        {modalMode === 'edit' && editing && <EditUserForm onClose={closeModal} initial={editing} />}
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => {
          setDeleteId(null);
          setDeleteError(null);
        }}
        onConfirm={() => deleteId !== null && deleteMutation.mutate(deleteId)}
        title="Supprimer l'utilisateur"
        message="Le compte sera désactivé et ses sessions actives révoquées. Cette action est irréversible."
        loading={deleteMutation.isPending}
        error={deleteError}
      />

      <ConfirmDialog
        open={unlockId !== null}
        onClose={() => {
          setUnlockId(null);
          setUnlockError(null);
        }}
        onConfirm={() => unlockId !== null && unlockMutation.mutate(unlockId)}
        title="Déverrouiller le compte"
        message="Le compte sera déverrouillé et le compteur d'échecs remis à zéro."
        confirmLabel="Déverrouiller"
        confirmVariant="primary"
        loading={unlockMutation.isPending}
        error={unlockError}
      />

      <ConfirmDialog
        open={resetId !== null}
        onClose={() => {
          setResetId(null);
          setResetError(null);
        }}
        onConfirm={() => resetId !== null && resetMutation.mutate(resetId)}
        title="Réinitialiser le mot de passe"
        message="Un mot de passe temporaire sera généré et toutes les sessions actives de ce compte seront révoquées."
        confirmLabel="Réinitialiser"
        confirmVariant="primary"
        loading={resetMutation.isPending}
        error={resetError}
      />

      <TempPasswordModal open={tempPassword !== null} password={tempPassword} onClose={() => setTempPassword(null)} />
    </div>
  );
}
