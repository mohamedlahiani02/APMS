"use client";
import { DataTable, useTableState } from "@/components/shared/DataTable";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Trash2,
  KeyRound,
  LockOpen,
  Copy,
  Check,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  unlockUser,
  resetUserPassword,
} from "@/features/users/services/userService";
import {
  userCreateSchema,
  userUpdateSchema,
  UserCreateInput,
  UserUpdateInput,
} from "@/lib/validations";
import { User } from "@/types";
import { extractApiErrorMessage } from "@/types/api";

import { useAuthStore } from "@/store/authStore";
import { formatDateTime } from "@/utils";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import PasswordInput from "@/components/ui/PasswordInput";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";

import ConfirmDialog from "@/components/shared/ConfirmDialog";

import ApiErrorBanner from "@/components/shared/ApiErrorBanner";

const ROLE_OPTIONS = [
  { value: "SECRETAIRE", label: "Secrétaire" },
  { value: "ADMIN", label: "Administrateur" },
];

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { role: "SECRETAIRE" },
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
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
  });

  return (
    <form
      data-guard-form
      onSubmit={handleSubmit((d) => mutation.mutate(d))}
      className="flex flex-col gap-4"
    >
      <Input
        id="email"
        label="Email *"
        type="email"
        placeholder="utilisateur@exemple.tn"
        error={errors.email?.message}
        {...register("email")}
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="firstName"
          label="Prénom"
          placeholder="Prénom"
          error={errors.firstName?.message}
          {...register("firstName")}
        />
        <Input
          id="lastName"
          label="Nom"
          placeholder="Nom"
          error={errors.lastName?.message}
          {...register("lastName")}
        />
      </div>
      <Select
        id="role"
        label="Rôle *"
        options={ROLE_OPTIONS}
        error={errors.role?.message}
        {...register("role")}
      />
      <div className="flex flex-col gap-1">
        <PasswordInput
          id="password"
          label="Mot de passe *"
          placeholder="Mot de passe temporaire"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <p className="text-xs text-gray-500">
          L&apos;utilisateur devra changer ce mot de passe à sa première
          connexion.
        </p>
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

function EditUserForm({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial: User;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserUpdateInput>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      firstName: initial.firstName ?? "",
      lastName: initial.lastName ?? "",
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
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
  });

  return (
    <form
      data-guard-form
      onSubmit={handleSubmit((d) => mutation.mutate(d))}
      className="flex flex-col gap-4"
    >
      <Input id="email" label="Email" value={initial.email} disabled readOnly />
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="firstName"
          label="Prénom"
          placeholder="Prénom"
          error={errors.firstName?.message}
          {...register("firstName")}
        />
        <Input
          id="lastName"
          label="Nom"
          placeholder="Nom"
          error={errors.lastName?.message}
          {...register("lastName")}
        />
      </div>
      <Select
        id="role"
        label="Rôle *"
        options={ROLE_OPTIONS}
        error={errors.role?.message}
        {...register("role")}
      />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" {...register("isActive")} className="rounded" />
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

function TempPasswordModal({
  open,
  password,
  onClose,
}: {
  open: boolean;
  password: string | null;
  onClose: () => void;
}) {
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
    <Modal
      open={open}
      onClose={onClose}
      title="Mot de passe temporaire"
      size="sm"
    >
      <p className="text-sm text-gray-600 mb-3">
        Le mot de passe a été réinitialisé. Communiquez-le à l&apos;utilisateur
        — il devra le changer à la prochaine connexion.
      </p>
      <div className="flex items-center gap-2 mb-3">
        <code className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 font-mono text-sm text-gray-900 select-all">
          {password ?? ""}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          title="Copier"
        >
          {copied ? (
            <Check size={16} className="text-green-600" />
          ) : (
            <Copy size={16} />
          )}
        </button>
      </div>
      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
        Ce mot de passe ne sera plus affiché. Toutes les sessions de cet
        utilisateur ont été révoquées.
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
    if (user && user.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const [modalMode, setModalMode] = useState<null | "create" | "edit">(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const table = useTableState("createdAt", "desc");
  const { page, setPage } = table;
  const [roleFilter, setRoleFilter] = useState(""),
    [activeFilter, setActiveFilter] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, setPage]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: [
      "users",
      page,
      table.size,
      table.sortBy,
      table.sortDirection,
      search,
      roleFilter,
      activeFilter,
    ],
    queryFn: () =>
      listUsers({
        page,
        size: table.size,
        sortBy: table.sortBy,
        sortDirection: table.sortDirection,
        search: search || undefined,
        role: (roleFilter as "ADMIN" | "SECRETAIRE") || undefined,
        isActive: activeFilter ? activeFilter === "true" : undefined,
      }),
    placeholderData: keepPreviousData,
    enabled: user?.role === "ADMIN",
  });

  const users = data?.content ?? [];
  const meta = data?.page;

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeleteId(null);
      setDeleteError(null);
      setPage(0);
    },
    onError: (err) =>
      setDeleteError(
        extractApiErrorMessage(err, "Erreur lors de la suppression."),
      ),
  });

  const unlockMutation = useMutation({
    mutationFn: unlockUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setUnlockId(null);
      setUnlockError(null);
    },
    onError: (err) =>
      setUnlockError(
        extractApiErrorMessage(err, "Erreur lors du déverrouillage."),
      ),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => resetUserPassword(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setResetId(null);
      setResetError(null);
      setTempPassword(res.temporaryPassword);
    },
    onError: (err) =>
      setResetError(
        extractApiErrorMessage(err, "Erreur lors de la réinitialisation."),
      ),
  });

  const openAdd = () => {
    setEditing(null);
    setModalMode("create");
  };
  const openEdit = (u: User) => {
    setEditing(u);
    setModalMode("edit");
  };
  const closeModal = () => {
    setModalMode(null);
    setEditing(null);
  };

  if (!user || user.role !== "ADMIN") return null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
          <p className="text-gray-500 text-sm mt-1">
            Gestion des comptes administrateurs et secrétaires.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={16} /> Ajouter Utilisateur
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          aria-label="Rechercher des utilisateurs"
          placeholder="Rechercher par email ou nom..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Select
          label="Rôle"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(0);
          }}
          options={[{ value: "", label: "Tous les rôles" }, ...ROLE_OPTIONS]}
        />
        <Select
          label="Statut"
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value);
            setPage(0);
          }}
          options={[
            { value: "", label: "Tous les statuts" },
            { value: "true", label: "Actifs" },
            { value: "false", label: "Inactifs" },
          ]}
        />
        <Button
          variant="secondary"
          onClick={() => {
            setSearchInput("");
            setSearch("");
            setRoleFilter("");
            setActiveFilter("");
            setPage(0);
          }}
        >
          Réinitialiser
        </Button>
      </div>
      <DataTable
        label="Utilisateurs"
        rows={users}
        rowKey={(r) => r.id}
        total={meta?.totalElements ?? 0}
        state={table}
        loading={isLoading}
        busy={isFetching}
        error={error}
        columns={[
          {
            key: "email",
            label: "Email",
            sortable: true,
            render: (r) => r.email,
          },
          {
            key: "firstName",
            label: "Nom complet",
            sortable: true,
            render: (r) =>
              [r.firstName, r.lastName].filter(Boolean).join(" ") || "—",
          },
          {
            key: "role",
            label: "Rôle",
            sortable: true,
            render: (r) =>
              r.role === "ADMIN" ? "Administrateur" : "Secrétaire",
          },
          {
            key: "status",
            label: "Statut",
            render: (r) => (
              <div className="flex flex-wrap gap-1">
                <Badge
                  className={
                    r.isActive
                      ? "bg-green-50 text-green-800"
                      : "bg-gray-100 text-gray-700"
                  }
                >
                  {r.isActive ? "Actif" : "Inactif"}
                </Badge>
                {r.mustChangePassword && (
                  <Badge className="bg-amber-50 text-amber-800">
                    Mot de passe à changer
                  </Badge>
                )}
              </div>
            ),
          },
          {
            key: "lastLoginAt",
            label: "Dernière connexion",
            sortable: true,
            render: (r) =>
              r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "Jamais",
          },
          {
            key: "actions",
            label: "Actions",
            render: (r) => (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={"Réinitialiser le mot de passe de " + r.email}
                  title="Réinitialiser le mot de passe"
                  onClick={() => setResetId(r.id)}
                >
                  <KeyRound size={16} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={"Déverrouiller " + r.email}
                  title="Déverrouiller"
                  onClick={() => setUnlockId(r.id)}
                >
                  <LockOpen size={16} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={"Supprimer " + r.email}
                  title="Supprimer"
                  onClick={() => setDeleteId(r.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={modalMode !== null}
        onClose={closeModal}
        title={
          modalMode === "edit"
            ? "Modifier l'utilisateur"
            : "Ajouter un utilisateur"
        }
      >
        {modalMode === "create" && <CreateUserForm onClose={closeModal} />}
        {modalMode === "edit" && editing && (
          <EditUserForm onClose={closeModal} initial={editing} />
        )}
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

      <TempPasswordModal
        open={tempPassword !== null}
        password={tempPassword}
        onClose={() => setTempPassword(null)}
      />
    </div>
  );
}
