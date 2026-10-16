import type { familles as FamilleRow } from "@prisma/client";
import { prisma, Prisma } from "../db.js";
import { audit } from "../common/audit.js";
import { familleHasProduits, ResourceNotFoundException } from "../common/errors.js";
import { toPagedResponse, type LookupQuery } from "../common/pagination.js";
import type { CurrentUser } from "../common/current-user.js";
import type {
  CreateFamilleRequest,
  FamilleListQuery,
  FamilleLookupItem,
  FamilleResponse,
  UpdateFamilleRequest,
} from "./schemas.js";

type Db = typeof prisma | Prisma.TransactionClient;

function toResponse(row: FamilleRow): FamilleResponse {
  return {
    id: row.id,
    code: row.code,
    nom: row.nom,
    description: row.description,
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

export async function listFamilles(query: FamilleListQuery) {
  const where = { deleted_at: null, ...searchWhere(query.search) };
  const [rows, total] = await Promise.all([
    prisma.familles.findMany({
      where,
      orderBy: { code: "asc" },
      skip: query.page * query.size,
      take: query.size,
    }),
    prisma.familles.count({ where }),
  ]);
  return toPagedResponse(rows.map(toResponse), total, query);
}

export async function lookupFamilles(query: LookupQuery): Promise<FamilleLookupItem[]> {
  const where = { deleted_at: null, ...searchWhere(query.q) };
  const rows = await prisma.familles.findMany({
    where,
    orderBy: { code: "asc" },
    take: query.limit,
  });
  return rows.map((row) => ({ id: row.id, code: row.code, label: row.nom }));
}

async function findActiveOrThrow(db: Db, id: string): Promise<FamilleRow> {
  const row = await db.familles.findFirst({ where: { id, deleted_at: null } });
  if (!row) throw new ResourceNotFoundException("famille", id);
  return row;
}

export async function getFamille(id: string): Promise<FamilleResponse> {
  return toResponse(await findActiveOrThrow(prisma, id));
}

/** Pure transactional body, reused by the HTTP route and directly by tests (rolled back there). */
export async function createFamilleTx(
  tx: Db,
  data: CreateFamilleRequest,
  actor: CurrentUser | null,
): Promise<FamilleResponse> {
  const created = await tx.familles.create({
    data: {
      code: data.code,
      nom: data.nom,
      description: data.description ?? null,
      is_active: data.isActive ?? true,
      created_by: actor?.id ?? null,
    },
  });
  await audit.logCreate(tx, {
    entityType: "FAMILLE",
    entityId: created.id,
    actor,
    summary: `Famille créée : ${created.code} - ${created.nom}`,
  });
  return toResponse(created);
}

export async function createFamille(
  data: CreateFamilleRequest,
  actor: CurrentUser | null,
): Promise<FamilleResponse> {
  return prisma.$transaction((tx) => createFamilleTx(tx, data, actor));
}

export async function updateFamilleTx(
  tx: Db,
  id: string,
  data: UpdateFamilleRequest,
  actor: CurrentUser | null,
): Promise<FamilleResponse> {
  const current = await findActiveOrThrow(tx, id);

  const changes: Record<string, unknown> = {};
  if (data.nom !== undefined && data.nom !== current.nom) {
    changes.nom = { from: current.nom, to: data.nom };
  }
  if (data.description !== undefined && data.description !== current.description) {
    changes.description = { from: current.description, to: data.description };
  }
  if (data.isActive !== undefined && data.isActive !== current.is_active) {
    changes.isActive = { from: current.is_active, to: data.isActive };
  }

  const updated = await tx.familles.update({
    where: { id },
    data: {
      nom: data.nom,
      description: data.description,
      is_active: data.isActive,
      updated_by: actor?.id ?? null,
      updated_at: new Date(),
    },
  });

  if (Object.keys(changes).length > 0) {
    await audit.logUpdate(tx, {
      entityType: "FAMILLE",
      entityId: id,
      actor,
      summary: `Famille modifiée : ${updated.code}`,
      changes,
    });
  }

  return toResponse(updated);
}

export async function updateFamille(
  id: string,
  data: UpdateFamilleRequest,
  actor: CurrentUser | null,
): Promise<FamilleResponse> {
  return prisma.$transaction((tx) => updateFamilleTx(tx, id, data, actor));
}

export async function deleteFamilleTx(tx: Db, id: string, actor: CurrentUser | null): Promise<void> {
  const current = await findActiveOrThrow(tx, id);

  const produitsCount = await tx.produits.count({ where: { famille_id: id, deleted_at: null } });
  if (produitsCount > 0) throw familleHasProduits(id);

  await tx.familles.update({
    where: { id },
    data: { deleted_at: new Date(), deleted_by: actor?.id ?? null },
  });

  await audit.logDelete(tx, {
    entityType: "FAMILLE",
    entityId: id,
    actor,
    summary: `Famille supprimée : ${current.code}`,
  });
}

export async function deleteFamille(id: string, actor: CurrentUser | null): Promise<void> {
  return prisma.$transaction((tx) => deleteFamilleTx(tx, id, actor));
}
