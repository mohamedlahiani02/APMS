import { listOrder } from "../common/list-filters.js";
import type { produits as ProduitRow } from "@prisma/client";
import { prisma, Prisma } from "../db.js";
import { audit } from "../common/audit.js";
import {
  produitReferenceDuplicate,
  ResourceNotFoundException,
} from "../common/errors.js";
import { toPagedResponse, type LookupQuery } from "../common/pagination.js";
import type { CurrentUser } from "../common/current-user.js";
import type {
  CreateProduitRequest,
  ProduitListQuery,
  ProduitLookupItem,
  ProduitResponse,
  UpdateProduitRequest,
} from "./schemas.js";

type Db = typeof prisma | Prisma.TransactionClient;
type ProduitWithFamille = ProduitRow & { familles: { nom: string } };

function toResponse(row: ProduitWithFamille): ProduitResponse {
  return {
    id: row.id,
    reference: row.reference,
    designation: row.designation,
    familleId: row.famille_id,
    familleNom: row.familles.nom,
    isActive: row.is_active,
  };
}

function searchWhere(search: string | undefined) {
  return search
    ? {
        OR: [
          { reference: { contains: search, mode: "insensitive" as const } },
          { designation: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
}

export async function listProduits(query: ProduitListQuery) {
  const where = {
    deleted_at: null,
    ...searchWhere(query.search),
    ...(query.familleId ? { famille_id: query.familleId } : {}),
    ...(query.isActive !== undefined ? { is_active: query.isActive } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.produits.findMany({
      where,
      include: { familles: { select: { nom: true } } },
      orderBy: listOrder(
        query,
        { reference: "reference", designation: "designation" },
        "reference",
      ),
      skip: query.page * query.size,
      take: query.size,
    }),
    prisma.produits.count({ where }),
  ]);
  return toPagedResponse(rows.map(toResponse), total, query);
}

export async function lookupProduits(
  query: LookupQuery,
): Promise<ProduitLookupItem[]> {
  const where = { deleted_at: null, ...searchWhere(query.q) };
  const rows = await prisma.produits.findMany({
    where,
    orderBy: { reference: "asc" },
    take: query.limit,
  });
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    label: row.designation,
  }));
}

async function findActiveOrThrow(
  db: Db,
  id: string,
): Promise<ProduitWithFamille> {
  const row = await db.produits.findFirst({
    where: { id, deleted_at: null },
    include: { familles: { select: { nom: true } } },
  });
  if (!row) throw new ResourceNotFoundException("produit", id);
  return row;
}

async function findActiveFamilleOrThrow(db: Db, familleId: string) {
  const famille = await db.familles.findFirst({
    where: { id: familleId, deleted_at: null },
  });
  if (!famille) throw new ResourceNotFoundException("famille", familleId);
  return famille;
}

export async function getProduit(id: string): Promise<ProduitResponse> {
  return toResponse(await findActiveOrThrow(prisma, id));
}

/** Pure transactional body, reused by the HTTP route and directly by tests (rolled back there). */
export async function createProduitTx(
  tx: Db,
  data: CreateProduitRequest,
  actor: CurrentUser | null,
): Promise<ProduitResponse> {
  const duplicate = await tx.produits.findFirst({
    where: { reference: data.reference, deleted_at: null },
  });
  if (duplicate) throw produitReferenceDuplicate(data.reference);

  const famille = await findActiveFamilleOrThrow(tx, data.familleId);

  const created = await tx.produits.create({
    data: {
      reference: data.reference,
      designation: data.designation,
      famille_id: data.familleId,
      is_active: data.isActive ?? true,
      created_by: actor?.id ?? null,
    },
  });
  await audit.logCreate(tx, {
    entityType: "PRODUIT",
    entityId: created.id,
    actor,
    summary: `Produit créé : ${created.reference} - ${created.designation}`,
  });
  return toResponse({ ...created, familles: { nom: famille.nom } });
}

export async function createProduit(
  data: CreateProduitRequest,
  actor: CurrentUser | null,
): Promise<ProduitResponse> {
  return prisma.$transaction((tx) => createProduitTx(tx, data, actor));
}

export async function updateProduitTx(
  tx: Db,
  id: string,
  data: UpdateProduitRequest,
  actor: CurrentUser | null,
): Promise<ProduitResponse> {
  const current = await findActiveOrThrow(tx, id);

  const changes: Record<string, unknown> = {};
  if (
    data.designation !== undefined &&
    data.designation !== current.designation
  ) {
    changes.designation = { from: current.designation, to: data.designation };
  }
  if (data.isActive !== undefined && data.isActive !== current.is_active) {
    changes.isActive = { from: current.is_active, to: data.isActive };
  }

  let newFamilleNom = current.familles.nom;
  if (data.familleId !== undefined && data.familleId !== current.famille_id) {
    const famille = await findActiveFamilleOrThrow(tx, data.familleId);
    newFamilleNom = famille.nom;
    changes.familleId = { from: current.famille_id, to: data.familleId };
  }

  const updated = await tx.produits.update({
    where: { id },
    data: {
      designation: data.designation,
      famille_id: data.familleId,
      is_active: data.isActive,
      updated_by: actor?.id ?? null,
      updated_at: new Date(),
    },
  });

  if (Object.keys(changes).length > 0) {
    await audit.logUpdate(tx, {
      entityType: "PRODUIT",
      entityId: id,
      actor,
      summary: `Produit modifié : ${updated.reference}`,
      changes,
    });
  }

  return toResponse({ ...updated, familles: { nom: newFamilleNom } });
}

export async function updateProduit(
  id: string,
  data: UpdateProduitRequest,
  actor: CurrentUser | null,
): Promise<ProduitResponse> {
  return prisma.$transaction((tx) => updateProduitTx(tx, id, data, actor));
}

/**
 * Soft-delete. Assumption: no documented referential guard for produits (unlike
 * familles -> produits), so this simply soft-deletes without checking dependent rows
 * (stock/vente/bl_achat lines keep referencing the produit_id regardless).
 */
export async function deleteProduitTx(
  tx: Db,
  id: string,
  actor: CurrentUser | null,
): Promise<void> {
  const current = await findActiveOrThrow(tx, id);

  await tx.produits.update({
    where: { id },
    data: { deleted_at: new Date(), deleted_by: actor?.id ?? null },
  });

  await audit.logDelete(tx, {
    entityType: "PRODUIT",
    entityId: id,
    actor,
    summary: `Produit supprimé : ${current.reference}`,
  });
}

export async function deleteProduit(
  id: string,
  actor: CurrentUser | null,
): Promise<void> {
  return prisma.$transaction((tx) => deleteProduitTx(tx, id, actor));
}
