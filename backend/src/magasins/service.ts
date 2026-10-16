import type { magasins as MagasinRow } from "@prisma/client";
import { prisma, Prisma } from "../db.js";
import { audit } from "../common/audit.js";
import { ResourceNotFoundException } from "../common/errors.js";
import { toPagedResponse, type LookupQuery } from "../common/pagination.js";
import type { CurrentUser } from "../common/current-user.js";
import type {
  CreateMagasinRequest,
  MagasinListQuery,
  MagasinLookupItem,
  MagasinResponse,
  UpdateMagasinRequest,
} from "./schemas.js";

type Db = typeof prisma | Prisma.TransactionClient;

function toResponse(row: MagasinRow): MagasinResponse {
  return {
    id: row.id,
    code: row.code,
    nom: row.nom,
    adresse: row.adresse,
    ville: row.ville,
    telephone: row.telephone,
    responsable: row.responsable,
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

export async function listMagasins(query: MagasinListQuery) {
  const where = { deleted_at: null, ...searchWhere(query.search) };
  const [rows, total] = await Promise.all([
    prisma.magasins.findMany({
      where,
      orderBy: { code: "asc" },
      skip: query.page * query.size,
      take: query.size,
    }),
    prisma.magasins.count({ where }),
  ]);
  return toPagedResponse(rows.map(toResponse), total, query);
}

export async function lookupMagasins(query: LookupQuery): Promise<MagasinLookupItem[]> {
  const where = { deleted_at: null, ...searchWhere(query.q) };
  const rows = await prisma.magasins.findMany({
    where,
    orderBy: { code: "asc" },
    take: query.limit,
  });
  return rows.map((row) => ({ id: row.id, code: row.code, label: row.nom }));
}

async function findActiveOrThrow(db: Db, id: string): Promise<MagasinRow> {
  const row = await db.magasins.findFirst({ where: { id, deleted_at: null } });
  if (!row) throw new ResourceNotFoundException("magasin", id);
  return row;
}

export async function getMagasin(id: string): Promise<MagasinResponse> {
  return toResponse(await findActiveOrThrow(prisma, id));
}

/** Pure transactional body, reused by the HTTP route and directly by tests (rolled back there). */
export async function createMagasinTx(
  tx: Db,
  data: CreateMagasinRequest,
  actor: CurrentUser | null,
): Promise<MagasinResponse> {
  const created = await tx.magasins.create({
    data: {
      code: data.code,
      nom: data.nom,
      adresse: data.adresse ?? null,
      ville: data.ville ?? null,
      telephone: data.telephone ?? null,
      responsable: data.responsable ?? null,
      is_active: data.isActive ?? true,
      created_by: actor?.id ?? null,
    },
  });
  await audit.logCreate(tx, {
    entityType: "MAGASIN",
    entityId: created.id,
    actor,
    summary: `Magasin créé : ${created.code} - ${created.nom}`,
  });
  return toResponse(created);
}

export async function createMagasin(
  data: CreateMagasinRequest,
  actor: CurrentUser | null,
): Promise<MagasinResponse> {
  return prisma.$transaction((tx) => createMagasinTx(tx, data, actor));
}

export async function updateMagasinTx(
  tx: Db,
  id: string,
  data: UpdateMagasinRequest,
  actor: CurrentUser | null,
): Promise<MagasinResponse> {
  const current = await findActiveOrThrow(tx, id);

  const changes: Record<string, unknown> = {};
  if (data.nom !== undefined && data.nom !== current.nom) {
    changes.nom = { from: current.nom, to: data.nom };
  }
  if (data.adresse !== undefined && data.adresse !== current.adresse) {
    changes.adresse = { from: current.adresse, to: data.adresse };
  }
  if (data.ville !== undefined && data.ville !== current.ville) {
    changes.ville = { from: current.ville, to: data.ville };
  }
  if (data.telephone !== undefined && data.telephone !== current.telephone) {
    changes.telephone = { from: current.telephone, to: data.telephone };
  }
  if (data.responsable !== undefined && data.responsable !== current.responsable) {
    changes.responsable = { from: current.responsable, to: data.responsable };
  }
  if (data.isActive !== undefined && data.isActive !== current.is_active) {
    changes.isActive = { from: current.is_active, to: data.isActive };
  }

  const updated = await tx.magasins.update({
    where: { id },
    data: {
      nom: data.nom,
      adresse: data.adresse,
      ville: data.ville,
      telephone: data.telephone,
      responsable: data.responsable,
      is_active: data.isActive,
      updated_by: actor?.id ?? null,
      updated_at: new Date(),
    },
  });

  if (Object.keys(changes).length > 0) {
    await audit.logUpdate(tx, {
      entityType: "MAGASIN",
      entityId: id,
      actor,
      summary: `Magasin modifié : ${updated.code}`,
      changes,
    });
  }

  return toResponse(updated);
}

export async function updateMagasin(
  id: string,
  data: UpdateMagasinRequest,
  actor: CurrentUser | null,
): Promise<MagasinResponse> {
  return prisma.$transaction((tx) => updateMagasinTx(tx, id, data, actor));
}

/**
 * Soft-delete. Assumption: unlike `familles`, there is no documented referential guard
 * for magasins (the original Java code didn't gate this the way it did for familles'
 * produits) — so this simply soft-deletes without checking for dependent rows.
 */
export async function deleteMagasinTx(tx: Db, id: string, actor: CurrentUser | null): Promise<void> {
  const current = await findActiveOrThrow(tx, id);

  await tx.magasins.update({
    where: { id },
    data: { deleted_at: new Date(), deleted_by: actor?.id ?? null },
  });

  await audit.logDelete(tx, {
    entityType: "MAGASIN",
    entityId: id,
    actor,
    summary: `Magasin supprimé : ${current.code}`,
  });
}

export async function deleteMagasin(id: string, actor: CurrentUser | null): Promise<void> {
  return prisma.$transaction((tx) => deleteMagasinTx(tx, id, actor));
}
