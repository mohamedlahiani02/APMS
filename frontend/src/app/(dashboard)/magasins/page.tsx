"use client";
import ReferencePage from "@/components/shared/ReferencePage";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateReference } from "@/lib/api/cache";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  listMagasins,
  createMagasin,
  updateMagasin,
  deleteMagasin,
} from "@/features/magasins/services/magasinService";
import { magasinSchema, MagasinInput } from "@/lib/validations";
import { Magasin } from "@/types";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

import ApiErrorBanner from "@/components/shared/ApiErrorBanner";

function MagasinForm({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: Magasin;
}) {
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
          adresse: initial.adresse ?? "",
          ville: initial.ville ?? "",
          telephone: initial.telephone ?? "",
          responsable: initial.responsable ?? "",
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
      invalidateReference(qc, "magasins");
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
          placeholder="Code magasin"
          error={errors.code?.message}
          readOnly={isEditing}
          {...register("code")}
        />
        <Input
          id="nom"
          label="Nom *"
          placeholder="Nom du magasin"
          error={errors.nom?.message}
          {...register("nom")}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="ville"
          label="Ville"
          placeholder="Ville"
          error={errors.ville?.message}
          {...register("ville")}
        />
        <Input
          id="telephone"
          label="Téléphone"
          placeholder="+216 71 234 567"
          error={errors.telephone?.message}
          {...register("telephone")}
        />
      </div>
      <Input
        id="adresse"
        label="Adresse"
        placeholder="Adresse du magasin"
        error={errors.adresse?.message}
        {...register("adresse")}
      />
      <Input
        id="responsable"
        label="Responsable"
        placeholder="Nom du responsable"
        error={errors.responsable?.message}
        {...register("responsable")}
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

export default function MagasinsPage() {
  return (
    <ReferencePage<Magasin>
      title="Magasins"
      resource="magasins"
      list={listMagasins}
      remove={deleteMagasin}
      columns={[
        { key: "code", label: "Code", sortable: true, render: (r) => r.code },
        { key: "nom", label: "Nom", sortable: true, render: (r) => r.nom },
        { key: "ville", label: "Ville", render: (r) => r.ville || "—" },
        {
          key: "responsable",
          label: "Responsable",
          render: (r) => r.responsable || "—",
        },
      ]}
      form={(initial, onClose) => (
        <MagasinForm initial={initial} onClose={onClose} />
      )}
    />
  );
}
