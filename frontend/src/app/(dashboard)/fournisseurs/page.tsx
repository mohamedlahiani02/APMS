"use client";
import ReferencePage from "@/components/shared/ReferencePage";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateReference } from "@/lib/api/cache";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  listFournisseurs,
  createFournisseur,
  updateFournisseur,
  deleteFournisseur,
} from "@/features/fournisseurs/services/fournisseurService";
import { fournisseurSchema, FournisseurInput } from "@/lib/validations";
import { Fournisseur } from "@/types";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

import ApiErrorBanner from "@/components/shared/ApiErrorBanner";

function FournisseurForm({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: Fournisseur;
}) {
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
          adresse: initial.adresse ?? "",
          telephone: initial.telephone ?? "",
          email: initial.email ?? "",
          contactPrincipal: initial.contactPrincipal ?? "",
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
      invalidateReference(qc, "fournisseurs");
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
          placeholder="Code fournisseur"
          error={errors.code?.message}
          readOnly={isEditing}
          {...register("code")}
        />
        <Input
          id="nom"
          label="Nom *"
          placeholder="Nom du fournisseur"
          error={errors.nom?.message}
          {...register("nom")}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="telephone"
          label="Téléphone"
          placeholder="+216 71 234 567"
          error={errors.telephone?.message}
          {...register("telephone")}
        />
        <Input
          id="email"
          label="Email"
          placeholder="contact@fournisseur.tn"
          error={errors.email?.message}
          {...register("email")}
        />
      </div>
      <Input
        id="adresse"
        label="Adresse"
        placeholder="Adresse complète"
        error={errors.adresse?.message}
        {...register("adresse")}
      />
      <Input
        id="contactPrincipal"
        label="Contact principal"
        placeholder="Nom du contact"
        error={errors.contactPrincipal?.message}
        {...register("contactPrincipal")}
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

export default function FournisseursPage() {
  return (
    <ReferencePage<Fournisseur>
      title="Fournisseurs"
      resource="fournisseurs"
      list={listFournisseurs}
      remove={deleteFournisseur}
      columns={[
        { key: "code", label: "Code", sortable: true, render: (r) => r.code },
        { key: "nom", label: "Nom", sortable: true, render: (r) => r.nom },
        {
          key: "telephone",
          label: "Téléphone",
          render: (r) => r.telephone || "—",
        },
        {
          key: "contact",
          label: "Contact",
          render: (r) => r.contactPrincipal || "—",
        },
      ]}
      form={(initial, onClose) => (
        <FournisseurForm initial={initial} onClose={onClose} />
      )}
    />
  );
}
