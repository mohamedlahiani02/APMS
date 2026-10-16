"use client";
import ReferencePage from "@/components/shared/ReferencePage";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateReference } from "@/lib/api/cache";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  listProduits,
  createProduit,
  updateProduit,
  deleteProduit,
} from "@/features/produits/services/produitService";
import { lookupFamilles } from "@/features/familles/services/familleService";
import { produitSchema, ProduitInput } from "@/lib/validations";
import { familleBadgeColor } from "@/lib/constants";
import { Produit } from "@/types";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import SearchSelect from "@/components/ui/SearchSelect";

import Badge from "@/components/ui/Badge";

import ApiErrorBanner from "@/components/shared/ApiErrorBanner";

function ProduitForm({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: Produit;
}) {
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
      ? {
          reference: initial.reference,
          designation: initial.designation,
          familleId: initial.familleId,
        }
      : undefined,
  });

  const familleId = useWatch({ control, name: "familleId" });

  const mutation = useMutation({
    mutationFn: (data: ProduitInput) =>
      isEditing
        ? updateProduit(initial!.id, {
            designation: data.designation,
            familleId: data.familleId,
          })
        : createProduit(data),
    onSuccess: () => {
      invalidateReference(qc, "produits");
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
          id="reference"
          label="Référence *"
          placeholder="Référence produit"
          error={errors.reference?.message}
          readOnly={isEditing}
          {...register("reference")}
        />
        <Input
          id="designation"
          label="Désignation *"
          placeholder="Nom du produit"
          error={errors.designation?.message}
          {...register("designation")}
        />
      </div>
      <SearchSelect
        label="Famille *"
        value={familleId ?? ""}
        onChange={(id) => setValue("familleId", id, { shouldValidate: true })}
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
          {isEditing ? "Modifier" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}

export default function ProduitsPage() {
  return (
    <ReferencePage<Produit>
      title="Produits"
      resource="produits"
      list={listProduits}
      remove={deleteProduit}
      defaultSort="reference"
      familyFilter
      columns={[
        {
          key: "reference",
          label: "Référence",
          sortable: true,
          render: (r) => <span className="font-mono">{r.reference}</span>,
        },
        {
          key: "designation",
          label: "Désignation",
          sortable: true,
          render: (r) => r.designation,
        },
        {
          key: "famille",
          label: "Famille",
          render: (r) => (
            <Badge className={familleBadgeColor(r.familleNom)}>
              {r.familleNom}
            </Badge>
          ),
        },
      ]}
      form={(initial, onClose) => (
        <ProduitForm initial={initial} onClose={onClose} />
      )}
    />
  );
}
