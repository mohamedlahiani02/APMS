import { prisma, round3, Prisma } from "../db.js";
import { audit, type AuditContext } from "../common/audit.js";
import type { CurrentUser } from "../common/current-user.js";
import { ResourceNotFoundException, entityInactive } from "../common/errors.js";
import { validateTransactionDate } from "../common/business-validation.js";
import { toPagedResponse, type PageQuery } from "../common/pagination.js";
import { parseDateOnly } from "./date-utils.js";
import { drawLine, reverseVenteLigne } from "./draw.js";
import { toVenteResponse, type VenteResponse } from "./mappers.js";
import type { CreateVenteInput, ListVentesQuery } from "./schemas.js";

type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

const VENTE_INCLUDE = {
  magasins: true,
  vente_lignes: { include: { produits: true }, orderBy: { created_at: "asc" as const } },
} satisfies Prisma.ventesInclude;

async function loadActiveMagasin(db: Db, id: string) {
  const row = await db.magasins.findUnique({ where: { id } });
  if (!row || row.deleted_at) throw new ResourceNotFoundException("Magasin", id);
  if (!row.is_active) throw entityInactive("Magasin", id);
  return row;
}

async function loadActiveProduit(db: Db, id: string) {
  const row = await db.produits.findUnique({ where: { id } });
  if (!row || row.deleted_at) throw new ResourceNotFoundException("Produit", id);
  if (!row.is_active) throw entityInactive("Produit", id);
  return row;
}

async function requireCalendarDateId(db: Db, isoDate: string, forDb: Date): Promise<number> {
  const row = await db.calendar.findUnique({ where: { date_full: forDb } });
  if (!row) throw new ResourceNotFoundException("Calendar", isoDate);
  return row.date_id;
}

async function loadVenteOrThrow(db: Db, id: string) {
  const row = await db.ventes.findUnique({ where: { id }, include: VENTE_INCLUDE });
  if (!row) throw new ResourceNotFoundException("Vente", id);
  return row;
}

/** Runs the draw algorithm for every requested line and persists the resulting vente_lignes rows. */
async function drawAndPersistAll(
  tx: Tx,
  venteId: string,
  magasinId: string,
  lignes: CreateVenteInput["lignes"],
): Promise<{ persistedCount: number; anyDepassement: boolean }> {
  let persistedCount = 0;
  let anyDepassement = false;

  for (const l of lignes) {
    await loadActiveProduit(tx, l.produitId);
    const rows = await drawLine(tx, magasinId, {
      produitId: l.produitId,
      qteVendue: round3(l.qteVendue),
      prixVenteTtc: round3(l.prixVenteTtc),
    });
    for (const row of rows) {
      await tx.vente_lignes.create({ data: { vente_id: venteId, ...row } });
      if (row.depassement_stock) anyDepassement = true;
    }
    persistedCount += rows.length;
  }

  return { persistedCount, anyDepassement };
}

export async function createVente(
  input: CreateVenteInput,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<VenteResponse> {
  return prisma.$transaction((tx) => createVenteTx(tx, input, actor, ctx));
}

/**
 * Core create logic, taking an explicit transaction client. Exported separately
 * from `createVente` so tests can run it inside their own outer
 * `prisma.$transaction` (and roll that back) instead of each call committing its
 * own independent transaction — `prisma.$transaction` calls do not nest.
 */
export async function createVenteTx(
  tx: Tx,
  input: CreateVenteInput,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<VenteResponse> {
  const { forValidation, forDb } = parseDateOnly(input.venteDate);
  validateTransactionDate(forValidation);

  {
    const dateId = await requireCalendarDateId(tx, input.venteDate, forDb);
    const magasin = await loadActiveMagasin(tx, input.magasinId);

    const vente = await tx.ventes.create({
      data: {
        date_id: dateId,
        vente_date: forDb,
        magasin_id: input.magasinId,
        created_by: actor.id,
      },
    });

    const { persistedCount, anyDepassement } = await drawAndPersistAll(
      tx,
      vente.id,
      input.magasinId,
      input.lignes,
    );

    const summary =
      `Vente créée : ${magasin.nom} (${input.lignes.length} produit(s), ${persistedCount} ligne(s) de stock` +
      (anyDepassement ? ", dépassement de stock signalé" : "") +
      ")";

    await audit.logCreate(tx, { entityType: "VENTE", entityId: vente.id, actor, summary, ...ctx });

    return toVenteResponse(await loadVenteOrThrow(tx, vente.id));
  }
}

export async function updateVente(
  id: string,
  input: CreateVenteInput,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<VenteResponse> {
  return prisma.$transaction((tx) => updateVenteTx(tx, id, input, actor, ctx));
}

/** Core update logic — see `createVenteTx` for why this takes an explicit `tx`. */
export async function updateVenteTx(
  tx: Tx,
  id: string,
  input: CreateVenteInput,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<VenteResponse> {
  const { forValidation, forDb } = parseDateOnly(input.venteDate);
  validateTransactionDate(forValidation);

  {
    const current = await tx.ventes.findUnique({ where: { id }, include: { vente_lignes: true } });
    if (!current) throw new ResourceNotFoundException("Vente", id);

    // Reverse every existing draw, then hard-delete the old lines, BEFORE redrawing —
    // this ordering is what lets a new line legitimately redraw from the very BL line
    // it just freed, all within this same transaction.
    for (const ligne of current.vente_lignes) {
      await reverseVenteLigne(tx, ligne);
    }
    await tx.vente_lignes.deleteMany({ where: { vente_id: id } });

    const dateId = await requireCalendarDateId(tx, input.venteDate, forDb);
    const magasin = await loadActiveMagasin(tx, input.magasinId);

    await tx.ventes.update({
      where: { id },
      data: {
        date_id: dateId,
        vente_date: forDb,
        magasin_id: input.magasinId,
        updated_by: actor.id,
        updated_at: new Date(),
      },
    });

    const { anyDepassement } = await drawAndPersistAll(tx, id, input.magasinId, input.lignes);

    const summary =
      `Vente modifiée : ${magasin.nom}` + (anyDepassement ? ", dépassement de stock signalé" : "");

    await audit.logUpdate(tx, { entityType: "VENTE", entityId: id, actor, summary, ...ctx });

    return toVenteResponse(await loadVenteOrThrow(tx, id));
  }
}

export async function deleteVente(id: string, actor: CurrentUser, ctx: AuditContext): Promise<void> {
  await prisma.$transaction((tx) => deleteVenteTx(tx, id, actor, ctx));
}

/** Core delete logic — see `createVenteTx` for why this takes an explicit `tx`. */
export async function deleteVenteTx(
  tx: Tx,
  id: string,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<void> {
  {
    const current = await tx.ventes.findUnique({
      where: { id },
      include: { vente_lignes: true, magasins: true },
    });
    if (!current) throw new ResourceNotFoundException("Vente", id);

    for (const ligne of current.vente_lignes) {
      await reverseVenteLigne(tx, ligne);
    }

    const lineCount = current.vente_lignes.length;
    // ON DELETE CASCADE cleans up vente_lignes rows themselves; reversal above already happened.
    await tx.ventes.delete({ where: { id } });

    await audit.logDelete(tx, {
      entityType: "VENTE",
      entityId: id,
      actor,
      summary: `Vente supprimée : ${current.magasins.nom} (${lineCount} ligne(s))`,
      ...ctx,
    });
  }
}

export async function getVente(id: string): Promise<VenteResponse> {
  return toVenteResponse(await loadVenteOrThrow(prisma, id));
}

export async function listVentes(query: ListVentesQuery) {
  const where: Prisma.ventesWhereInput = {};
  if (query.magasinId) where.magasin_id = query.magasinId;
  if (query.dateFrom || query.dateTo) {
    where.vente_date = {
      ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom).forDb } : {}),
      ...(query.dateTo ? { lte: parseDateOnly(query.dateTo).forDb } : {}),
    };
  }
  if (query.search) {
    where.vente_lignes = {
      some: {
        produits: {
          OR: [
            { reference: { contains: query.search, mode: "insensitive" } },
            { designation: { contains: query.search, mode: "insensitive" } },
          ],
        },
      },
    };
  }

  const [total, rows] = await Promise.all([
    prisma.ventes.count({ where }),
    prisma.ventes.findMany({
      where,
      include: VENTE_INCLUDE,
      orderBy: [{ vente_date: "desc" }, { created_at: "desc" }],
      skip: query.page * query.size,
      take: query.size,
    }),
  ]);

  return toPagedResponse(rows.map(toVenteResponse), total, query as PageQuery);
}
