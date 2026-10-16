"use client";
import ReferencePage from "@/components/shared/ReferencePage";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateReference } from "@/lib/api/cache";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  listFamilles,
  createFamille,
  updateFamille,
  deleteFamille,
} from "@/features/familles/services/familleService";
import { familleSchema, FamilleInput } from "@/lib/validations";
import { Famille } from "@/types";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

import ApiErrorBanner from "@/components/shared/ApiErrorBanner";

function FamilleForm({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: Famille;
}) {
  const qc = useQueryClient();
  const isEditing = !!initial;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FamilleInput>({
    resolver: zodResolver(familleSchema),
    defaultValues: initial
      ? {
          code: initial.code,
          nom: initial.nom,
          description: initial.description ?? "",
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (data: FamilleInput) =>
      isEditing
        ? updateFamille(initial!.id, {
            nom: data.nom,
            description: data.description,
          })
        : createFamille(data),
    onSuccess: () => {
      invalidateReference(qc, "familles");
      onClose();
    },
  });

  return (
    <form
      data-guard-form
      onSubmit={handleSubmit((d) => mutation.mutate(d))}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="code"
          label="Code *"
          placeholder="Code famille"
          error={errors.code?.message}
          readOnly={isEditing}
          {...register("code")}
        />
        <Input
          id="nom"
          label="Nom *"
          placeholder="Filtres"
          error={errors.nom?.message}
          {...register("nom")}
        />
      </div>
      <Input
        id="description"
        label="Description"
        placeholder="Description de la famille"
        error={errors.description?.message}
        {...register("description")}
      />
      <ApiErrorBanner error={mutation.error} />
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          {isEditing ? "Modifier" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}

export default function FamillesPage() {
  return (
    <ReferencePage<Famille>
      title="Familles"
      resource="familles"
      list={listFamilles}
      remove={deleteFamille}
      columns={[
        { key: "code", label: "Code", sortable: true, render: (r) => r.code },
        { key: "nom", label: "Nom", sortable: true, render: (r) => r.nom },
        {
          key: "description",
          label: "Description",
          render: (r) => r.description || "—",
        },
      ]}
      form={(initial, onClose) => (
        <FamilleForm initial={initial} onClose={onClose} />
      )}
    />
  );
}
