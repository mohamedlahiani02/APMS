import { listOrder } from "../common/list-filters.js";
import { lockStockLedger } from "../common/stock-lock.js";
import { prisma, round3, Prisma } from "../db.js";
import { audit, type AuditContext } from "../common/audit.js";
import type { CurrentUser } from "../common/current-user.js";
import {
  BlAchatHasVentesException,
  ResourceNotFoundException,
  entityInactive,
} from "../common/errors.js";
import {
  validateTransactionDate,
  validateTauxTva,
} from "../common/business-validation.js";
import { toPagedResponse, type PageQuery } from "../common/pagination.js";
import { parseDateOnly } from "./date-utils.js";
import { toBlAchatResponse, type BlAchatResponse } from "./mappers.js";
import type {
  CreateBlAchatInput,
  UpdateBlAchatInput,
  ListBlAchatsQuery,
} from "./schemas.js";

type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

const BL_ACHAT_INCLUDE = {
  magasins: true,
  fournisseurs: true,
  bl_achat_lignes: {
    where: { deleted_at: null },
    include: { produits: true },
    orderBy: { created_at: "asc" as const },
  },
} satisfies Prisma.bl_achatsInclude;

async function loadActiveMagasin(db: Db, id: string) {
  const row = await db.magasins.findUnique({ where: { id } });
  if (!row || row.deleted_at)
    throw new ResourceNotFoundException("Magasin", id);
  if (!row.is_active) throw entityInactive("Magasin", id);
  return row;
}

async function loadActiveFournisseur(db: Db, id: string) {
  const row = await db.fournisseurs.findUnique({ where: { id } });
  if (!row || row.deleted_at)
    throw new ResourceNotFoundException("Fournisseur", id);
  if (!row.is_active) throw entityInactive("Fournisseur", id);
  return row;
}

async function loadActiveProduit(db: Db, id: string) {
  const row = await db.produits.findUnique({ where: { id } });
  if (!row || row.deleted_at)
    throw new ResourceNotFoundException("Produit", id);
  if (!row.is_active) throw entityInactive("Produit", id);
  return row;
}

async function requireCalendarDateId(
  db: Db,
  isoDate: string,
  forDb: Date,
): Promise<number> {
  const row = await db.calendar.findUnique({ where: { date_full: forDb } });
  if (!row) throw new ResourceNotFoundException("Calendar", isoDate);
  return row.date_id;
}

async function loadBlAchatOrThrow(db: Db, id: string) {
  const row = await db.bl_achats.findFirst({
    where: { id, deleted_at: null },
    include: BL_ACHAT_INCLUDE,
  });
  if (!row) throw new ResourceNotFoundException("BlAchat", id);
  return row;
}

function computeLignePrices(
  qteAchetee: number,
  prixAchatNetHt: number,
  tauxTva: number,
) {
  const prixAchatTtc = round3(
    round3(prixAchatNetHt).times(
      new Prisma.Decimal(1).plus(new Prisma.Decimal(tauxTva).div(100)),
    ),
  );
  const prixAchatTotalTtc = round3(prixAchatTtc.times(round3(qteAchetee)));
  return { prixAchatTtc, prixAchatTotalTtc };
}

export async function createBlAchat(
  input: CreateBlAchatInput,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<BlAchatResponse> {
  return prisma.$transaction((tx) => createBlAchatTx(tx, input, actor, ctx));
}

/**
 * Core create logic, taking an explicit transaction client. Exported separately
 * from `createBlAchat` so tests can run it inside their own outer
 * `prisma.$transaction` (and roll that back) instead of each call committing its
 * own independent transaction — `prisma.$transaction` calls do not nest.
 */
export async function createBlAchatTx(
  tx: Tx,
  input: CreateBlAchatInput,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<BlAchatResponse> {
  await lockStockLedger(tx);
  const { forValidation, forDb } = parseDateOnly(input.transactionDate);
  validateTransactionDate(forValidation);
  for (const l of input.lignes) {
    validateTauxTva(l.tauxTva);
  }

  {
    const dateId = await requireCalendarDateId(
      tx,
      input.transactionDate,
      forDb,
    );
    await loadActiveMagasin(tx, input.magasinId);
    await loadActiveFournisseur(tx, input.fournisseurId);
    for (const l of input.lignes) {
      await loadActiveProduit(tx, l.produitId);
    }

    const bl = await tx.bl_achats.create({
      data: {
        date_id: dateId,
        transaction_date: forDb,
        bl_numero: input.blNumero,
        magasin_id: input.magasinId,
        fournisseur_id: input.fournisseurId,
        created_by: actor.id,
      },
    });

    for (const l of input.lignes) {
      const { prixAchatTtc, prixAchatTotalTtc } = computeLignePrices(
        l.qteAchetee,
        l.prixAchatNetHt,
        l.tauxTva,
      );
      await tx.bl_achat_lignes.create({
        data: {
          bl_achat_id: bl.id,
          produit_id: l.produitId,
          qte_achetee: round3(l.qteAchetee),
          qte_restante: round3(l.qteAchetee),
          prix_achat_net_ht: round3(l.prixAchatNetHt),
          taux_tva: l.tauxTva,
          prix_achat_ttc: prixAchatTtc,
          prix_achat_total_ttc: prixAchatTotalTtc,
          created_by: actor.id,
        },
      });
    }

    await audit.logCreate(tx, {
      entityType: "BL_ACHAT",
      entityId: bl.id,
      actor,
      summary: `BL achat créé : ${input.blNumero}`,
      ...ctx,
    });

    return toBlAchatResponse(await loadBlAchatOrThrow(tx, bl.id));
  }
}

export async function updateBlAchat(
  id: string,
  input: UpdateBlAchatInput,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<BlAchatResponse> {
  return prisma.$transaction((tx) =>
    updateBlAchatTx(tx, id, input, actor, ctx),
  );
}

/** Core update logic — see `createBlAchatTx` for why this takes an explicit `tx`. */
export async function updateBlAchatTx(
  tx: Tx,
  id: string,
  input: UpdateBlAchatInput,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<BlAchatResponse> {
  await lockStockLedger(tx);
  {
    const current = await tx.bl_achats.findFirst({
      where: { id, deleted_at: null },
      include: { bl_achat_lignes: { where: { deleted_at: null } } },
    });
    if (!current) throw new ResourceNotFoundException("BlAchat", id);

    // Check drawn state FIRST, before any other change, when lignes replacement is requested.
    if (input.lignes !== undefined) {
      const hasDrawn = current.bl_achat_lignes.some(
        (l) =>
          !new Prisma.Decimal(l.qte_restante).equals(
            new Prisma.Decimal(l.qte_achetee),
          ),
      );
      if (hasDrawn) {
        throw new BlAchatHasVentesException(
          "Impossible de modifier les lignes de ce BL : au moins une vente y est rattachée.",
        );
      }
    }

    const data: Prisma.bl_achatsUncheckedUpdateInput = {
      updated_by: actor.id,
      updated_at: new Date(),
    };

    if (input.transactionDate !== undefined) {
      const { forValidation, forDb } = parseDateOnly(input.transactionDate);
      validateTransactionDate(forValidation);
      const dateId = await requireCalendarDateId(
        tx,
        input.transactionDate,
        forDb,
      );
      data.date_id = dateId;
      data.transaction_date = forDb;
    }
    if (input.blNumero !== undefined) data.bl_numero = input.blNumero;
    if (input.magasinId !== undefined) {
      await loadActiveMagasin(tx, input.magasinId);
      data.magasin_id = input.magasinId;
    }
    if (input.fournisseurId !== undefined) {
      await loadActiveFournisseur(tx, input.fournisseurId);
      data.fournisseur_id = input.fournisseurId;
    }

    await tx.bl_achats.update({ where: { id }, data });

    if (input.lignes !== undefined) {
      for (const l of input.lignes) {
        validateTauxTva(l.tauxTva);
      }
      const now = new Date();
      await tx.bl_achat_lignes.updateMany({
        where: { bl_achat_id: id, deleted_at: null },
        data: { deleted_at: now, deleted_by: actor.id },
      });
      for (const l of input.lignes) {
        await loadActiveProduit(tx, l.produitId);
        const { prixAchatTtc, prixAchatTotalTtc } = computeLignePrices(
          l.qteAchetee,
          l.prixAchatNetHt,
          l.tauxTva,
        );
        await tx.bl_achat_lignes.create({
          data: {
            bl_achat_id: id,
            produit_id: l.produitId,
            qte_achetee: round3(l.qteAchetee),
            qte_restante: round3(l.qteAchetee),
            prix_achat_net_ht: round3(l.prixAchatNetHt),
            taux_tva: l.tauxTva,
            prix_achat_ttc: prixAchatTtc,
            prix_achat_total_ttc: prixAchatTotalTtc,
            created_by: actor.id,
          },
        });
      }
    }

    const updated = await loadBlAchatOrThrow(tx, id);

    await audit.logUpdate(tx, {
      entityType: "BL_ACHAT",
      entityId: id,
      actor,
      summary: `BL achat modifié : ${updated.bl_numero}`,
      ...ctx,
    });

    return toBlAchatResponse(updated);
  }
}

export async function deleteBlAchat(
  id: string,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<void> {
  await prisma.$transaction((tx) => deleteBlAchatTx(tx, id, actor, ctx));
}

/** Core delete logic — see `createBlAchatTx` for why this takes an explicit `tx`. */
export async function deleteBlAchatTx(
  tx: Tx,
  id: string,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<void> {
  await lockStockLedger(tx);
  {
    const current = await tx.bl_achats.findFirst({
      where: { id, deleted_at: null },
      include: { bl_achat_lignes: { where: { deleted_at: null } } },
    });
    if (!current) throw new ResourceNotFoundException("BlAchat", id);

    const lineIds = current.bl_achat_lignes.map((l) => l.id);
    const drawnCount =
      lineIds.length === 0
        ? 0
        : await tx.vente_lignes.count({
            where: { bl_achat_ligne_id: { in: lineIds } },
          });
    if (drawnCount > 0) {
      throw new BlAchatHasVentesException();
    }

    const now = new Date();
    await tx.bl_achat_lignes.updateMany({
      where: { bl_achat_id: id, deleted_at: null },
      data: { deleted_at: now, deleted_by: actor.id },
    });
    await tx.bl_achats.update({
      where: { id },
      data: { deleted_at: now, deleted_by: actor.id },
    });

    await audit.logDelete(tx, {
      entityType: "BL_ACHAT",
      entityId: id,
      actor,
      summary: `BL achat supprimé : ${current.bl_numero}`,
      ...ctx,
    });
  }
}

export async function getBlAchat(id: string): Promise<BlAchatResponse> {
  return toBlAchatResponse(await loadBlAchatOrThrow(prisma, id));
}

export function buildBlAchatWhere(
  query: Partial<ListBlAchatsQuery>,
): Prisma.bl_achatsWhereInput {
  const where: Prisma.bl_achatsWhereInput = { deleted_at: null };
  if (query.magasinId) where.magasin_id = query.magasinId;
  if (query.fournisseurId) where.fournisseur_id = query.fournisseurId;
  if (query.dateFrom || query.dateTo) {
    where.transaction_date = {
      ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom).forDb } : {}),
      ...(query.dateTo ? { lte: parseDateOnly(query.dateTo).forDb } : {}),
    };
  }
  if (query.search) {
    where.OR = [
      { bl_numero: { contains: query.search, mode: "insensitive" } },
      {
        bl_achat_lignes: {
          some: {
            deleted_at: null,
            produits: {
              OR: [
                { reference: { contains: query.search, mode: "insensitive" } },
                {
                  designation: { contains: query.search, mode: "insensitive" },
                },
              ],
            },
          },
        },
      },
    ];
  }

  if (query.consumed) {
    const drawn = {
      deleted_at: null,
      qte_restante: { lt: prisma.bl_achat_lignes.fields.qte_achetee },
    };
    where.AND = [
      {
        bl_achat_lignes:
          query.consumed === "yes" ? { some: drawn } : { none: drawn },
      },
    ];
  }
  return where;
}

export async function listBlAchats(query: ListBlAchatsQuery) {
  const where = buildBlAchatWhere(query);
  const [total, rows] = await Promise.all([
    prisma.bl_achats.count({ where }),
    prisma.bl_achats.findMany({
      where,
      include: BL_ACHAT_INCLUDE,
      orderBy: listOrder(
        query,
        { date: "transaction_date", blNumero: "bl_numero" },
        "transaction_date",
        "desc",
      ),
      skip: query.page * query.size,
      take: query.size,
    }),
  ]);

  return toPagedResponse(
    rows.map(toBlAchatResponse),
    total,
    query as PageQuery,
  );
}

export async function lookupBlAchats(q: string | undefined, limit: number) {
  const where: Prisma.bl_achatsWhereInput = { deleted_at: null };
  if (q) where.bl_numero = { contains: q, mode: "insensitive" };
  const rows = await prisma.bl_achats.findMany({
    where,
    take: limit,
    orderBy: { transaction_date: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    blNumero: r.bl_numero,
    label: r.bl_numero,
  }));
}
