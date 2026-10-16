import type { fournisseurs as FournisseurRow } from "@prisma/client";
import { prisma, Prisma } from "../db.js";
import { audit } from "../common/audit.js";
import { ResourceNotFoundException } from "../common/errors.js";
import { toPagedResponse, type LookupQuery } from "../common/pagination.js";
import type { CurrentUser } from "../common/current-user.js";
import type {
  CreateFournisseurRequest,
  FournisseurListQuery,
  FournisseurLookupItem,
  FournisseurResponse,
  UpdateFournisseurRequest,
} from "./schemas.js";

type Db = typeof prisma | Prisma.TransactionClient;

function toResponse(row: FournisseurRow): FournisseurResponse {
  return {
    id: row.id,
    code: row.code,
    nom: row.nom,
    adresse: row.adresse,
    telephone: row.telephone,
    email: row.email,
    contactPrincipal: row.contact_principal,
    isActive: row.is_active,
  };
}

function searchWhere(search: string | undefined) {
  return search
    ? {
        OR: [
          { code: { contains: search, mode: "insensitive" as const } },
          { nom: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
}

export async function listFournisseurs(query: FournisseurListQuery) {
  const where = { deleted_at: null, ...searchWhere(query.search) };
  const [rows, total] = await Promise.all([
    prisma.fournisseurs.findMany({
      where,
      orderBy: { code: "asc" },
      skip: query.page * query.size,
      take: query.size,
    }),
    prisma.fournisseurs.count({ where }),
  ]);
  return toPagedResponse(rows.map(toResponse), total, query);
}

export async function lookupFournisseurs(query: LookupQuery): Promise<FournisseurLookupItem[]> {
  const where = { deleted_at: null, ...searchWhere(query.q) };
  const rows = await prisma.fournisseurs.findMany({
    where,
    orderBy: { code: "asc" },
    take: query.limit,
  });
  return rows.map((row) => ({ id: row.id, code: row.code, label: row.nom }));
}

async function findActiveOrThrow(db: Db, id: string): Promise<FournisseurRow> {
  const row = await db.fournisseurs.findFirst({ where: { id, deleted_at: null } });
  if (!row) throw new ResourceNotFoundException("fournisseur", id);
  return row;
}

export async function getFournisseur(id: string): Promise<FournisseurResponse> {
  return toResponse(await findActiveOrThrow(prisma, id));
}

/** Pure transactional body, reused by the HTTP route and directly by tests (rolled back there). */
export async function createFournisseurTx(
  tx: Db,
  data: CreateFournisseurRequest,
  actor: CurrentUser | null,
): Promise<FournisseurResponse> {
  const created = await tx.fournisseurs.create({
    data: {
      code: data.code,
      nom: data.nom,
      adresse: data.adresse ?? null,
      telephone: data.telephone ?? null,
      email: data.email ?? null,
      contact_principal: data.contactPrincipal ?? null,
      is_active: data.isActive ?? true,
      created_by: actor?.id ?? null,
    },
  });
  await audit.logCreate(tx, {
    entityType: "FOURNISSEUR",
    entityId: created.id,
    actor,
    summary: `Fournisseur créé : ${created.code} - ${created.nom}`,
  });
  return toResponse(created);
}

export async function createFournisseur(
  data: CreateFournisseurRequest,
  actor: CurrentUser | null,
): Promise<FournisseurResponse> {
  return prisma.$transaction((tx) => createFournisseurTx(tx, data, actor));
}

export async function updateFournisseurTx(
  tx: Db,
  id: string,
  data: UpdateFournisseurRequest,
  actor: CurrentUser | null,
): Promise<FournisseurResponse> {
  const current = await findActiveOrThrow(tx, id);

  const changes: Record<string, unknown> = {};
  if (data.nom !== undefined && data.nom !== current.nom) {
    changes.nom = { from: current.nom, to: data.nom };
  }
  if (data.adresse !== undefined && data.adresse !== current.adresse) {
    changes.adresse = { from: current.adresse, to: data.adresse };
  }
  if (data.telephone !== undefined && data.telephone !== current.telephone) {
    changes.telephone = { from: current.telephone, to: data.telephone };
  }
  if (data.email !== undefined && data.email !== current.email) {
    changes.email = { from: current.email, to: data.email };
  }
  if (data.contactPrincipal !== undefined && data.contactPrincipal !== current.contact_principal) {
    changes.contactPrincipal = { from: current.contact_principal, to: data.contactPrincipal };
  }
  if (data.isActive !== undefined && data.isActive !== current.is_active) {
    changes.isActive = { from: current.is_active, to: data.isActive };
  }

  const updated = await tx.fournisseurs.update({
    where: { id },
    data: {
      nom: data.nom,
      adresse: data.adresse,
      telephone: data.telephone,
      email: data.email,
      contact_principal: data.contactPrincipal,
      is_active: data.isActive,
      updated_by: actor?.id ?? null,
      updated_at: new Date(),
    },
  });

  if (Object.keys(changes).length > 0) {
    await audit.logUpdate(tx, {
      entityType: "FOURNISSEUR",
      entityId: id,
      actor,
      summary: `Fournisseur modifié : ${updated.code}`,
      changes,
    });
  }

  return toResponse(updated);
}

export async function updateFournisseur(
  id: string,
  data: UpdateFournisseurRequest,
  actor: CurrentUser | null,
): Promise<FournisseurResponse> {
  return prisma.$transaction((tx) => updateFournisseurTx(tx, id, data, actor));
}

/**
 * Soft-delete. Assumption: unlike `familles`, there is no documented referential guard
 * for fournisseurs (the original Java code didn't gate this the way it did for familles'
 * produits) — so this simply soft-deletes without checking for dependent rows.
 */
export async function deleteFournisseurTx(tx: Db, id: string, actor: CurrentUser | null): Promise<void> {
  const current = await findActiveOrThrow(tx, id);

  await tx.fournisseurs.update({
    where: { id },
    data: { deleted_at: new Date(), deleted_by: actor?.id ?? null },
  });

  await audit.logDelete(tx, {
    entityType: "FOURNISSEUR",
    entityId: id,
    actor,
    summary: `Fournisseur supprimé : ${current.code}`,
  });
}

export async function deleteFournisseur(id: string, actor: CurrentUser | null): Promise<void> {
  return prisma.$transaction((tx) => deleteFournisseurTx(tx, id, actor));
}
