import { prisma, Prisma, round3 } from '../db.js';
import { lockStockLedger } from '../common/stock-lock.js';
import { audit, type AuditContext } from '../common/audit.js';
import type { CurrentUser } from '../common/current-user.js';
import { ValidationException, ResourceNotFoundException } from '../common/errors.js';
import { drawLine, reverseVenteLigne } from '../ventes/draw.js';

type Tx = Prisma.TransactionClient;
const businessYear = () => Number(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Tunis', year: 'numeric' }).format(new Date()));
export const listYears = () => prisma.stock_years.findMany({ orderBy: { annee: 'desc' } });
export interface OpeningInput { mode: 'CARRY' | 'MANUAL'; lignes?: { produitId: string; magasinId: string; quantite: number }[] }
async function closing(tx: Tx, year: number) {
  const state = await tx.stock_years.findUnique({ where: { annee: year } });
  if (!state) throw new ResourceNotFoundException('Année', String(year));
  if (state.needs_review) throw new ValidationException('Revalidez d’abord l’ouverture de cette année.');
  await tx.$executeRawUnsafe('CALL public.calculer_snapshot_mois(' + year + ',12)');
  const rows = await tx.$queryRaw<{ produit_id: string; magasin_id: string; reference: string; designation: string; magasin: string; quantite: Prisma.Decimal; cout: Prisma.Decimal; deficit: Prisma.Decimal }[]>`
    WITH balance AS (
      SELECT produit_id,magasin_id,sum(qte_stock) quantity,sum(valeur_stock) value,sum(qte_deficit) deficit
      FROM analytics_stock_snapshot WHERE annee=${year} AND mois=12 GROUP BY 1,2
    ), costs AS (
      SELECT produit_id,magasin_id,coalesce(sum(qty*cost)/nullif(sum(qty),0),max(cost)) cost FROM (
        SELECT l.produit_id,b.magasin_id,l.qte_achetee qty,l.prix_achat_net_ht cost FROM bl_achat_lignes l JOIN bl_achats b ON b.id=l.bl_achat_id
        WHERE l.deleted_at IS NULL AND b.deleted_at IS NULL AND extract(year FROM b.transaction_date)<=${year}
          AND (${state.mode}='LEGACY' OR extract(year FROM b.transaction_date)=${year})
        UNION ALL SELECT produit_id,magasin_id,qte_ouverture,cout_unitaire FROM annual_stock_opening WHERE annee=${year}
      ) src GROUP BY 1,2
    ) SELECT coalesce(b.produit_id,c.produit_id) produit_id,coalesce(b.magasin_id,c.magasin_id) magasin_id,
      p.reference,p.designation,m.nom magasin,coalesce(b.quantity,0)::numeric quantite,
      round(coalesce(CASE WHEN b.quantity>0 THEN b.value/b.quantity END,c.cost,0),3)::numeric cout,coalesce(b.deficit,0)::numeric deficit
    FROM balance b FULL JOIN costs c USING(produit_id,magasin_id)
    JOIN produits p ON p.id=coalesce(b.produit_id,c.produit_id)
    JOIN magasins m ON m.id=coalesce(b.magasin_id,c.magasin_id) ORDER BY p.reference,m.nom
  `;
  return rows.map(r => ({ produitId: r.produit_id, magasinId: r.magasin_id, reference: r.reference, designation: r.designation, magasin: r.magasin, quantite: Number(r.quantite), coutUnitaire: Number(r.cout), deficit: Number(r.deficit) }));
}
export const getClosing = (year: number) => prisma.$transaction(async tx => { await lockStockLedger(tx); return closing(tx, year); }, { timeout: 30000 });
export async function getOpening(year: number) {
  const state = await prisma.stock_years.findUnique({ where: { annee: year } });
  if (!state) return { state: null, lignes: [] };
  const rows = await prisma.$queryRaw<{ produit_id: string; magasin_id: string; reference: string; designation: string; magasin: string; qte_ouverture: Prisma.Decimal; cout_unitaire: Prisma.Decimal }[]>`
    SELECT o.*,p.reference,p.designation,m.nom magasin FROM annual_stock_opening o JOIN produits p ON p.id=o.produit_id JOIN magasins m ON m.id=o.magasin_id WHERE o.annee=${year} ORDER BY p.reference,m.nom
  `;
  return { state, lignes: rows.map(r => ({ produitId: r.produit_id, magasinId: r.magasin_id, reference: r.reference, designation: r.designation, magasin: r.magasin, quantite: Number(r.qte_ouverture), coutUnitaire: Number(r.cout_unitaire) })) };
}
export async function setOpening(year: number, input: OpeningInput, actor: CurrentUser, ctx: AuditContext) {
  if (year > businessYear() + 1 || year < 1971) throw new ValidationException('Année invalide.');
  return prisma.$transaction(async tx => {
    await lockStockLedger(tx);
    const previous = await tx.stock_years.findUnique({ where: { annee: year - 1 } });
    const existing = await tx.stock_years.findUnique({ where: { annee: year } });
    if (!previous || previous.statut !== 'CLOSED' || previous.needs_review) throw new ValidationException('Clôturez et validez d’abord l’année précédente.');
    if (existing && (existing.mode === 'LEGACY' || existing.statut === 'CLOSED')) throw new ValidationException('Cette ouverture ne peut pas être modifiée. Réouvrez l’année si elle est clôturée.');
    const baseline = await closing(tx, year - 1);
    if (baseline.some(r => r.deficit > 0)) throw new ValidationException('Résolvez les déficits de stock avant la reprise.');
    const key = (p: string, m: string) => p + ':' + m;
    const costs = new Map(baseline.map(r => [key(r.produitId, r.magasinId), r]));
    const lines = input.mode === 'CARRY' ? baseline : (input.lignes ?? []);
    const seen = new Set<string>();
    for (const line of lines) {
      const k = key(line.produitId, line.magasinId);
      if (seen.has(k)) throw new ValidationException('Un produit ne peut apparaître qu’une fois par magasin.');
      seen.add(k);
      if (!costs.has(k)) throw new ValidationException('Le coût de clôture est inconnu pour ce produit et ce magasin.');
    }
    await tx.stock_years.upsert({ where: { annee: year }, create: { annee: year, mode: input.mode }, update: { mode: input.mode, needs_review: false } });
    const sales = await tx.ventes.findMany({ where: { vente_date: { gte: new Date(year + '-01-01'), lt: new Date((year + 1) + '-01-01') } }, include: { vente_lignes: true }, orderBy: [{ vente_date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }] });
    for (const sale of sales) for (const line of sale.vente_lignes) await reverseVenteLigne(tx, line);
    await tx.vente_lignes.deleteMany({ where: { vente_id: { in: sales.map(s => s.id) } } });
    await tx.annual_stock_opening.deleteMany({ where: { annee: year } });
    for (const line of lines) {
      const qty = round3(line.quantite);
      await tx.annual_stock_opening.create({ data: { annee: year, produit_id: line.produitId, magasin_id: line.magasinId, qte_ouverture: qty, qte_restante: qty, cout_unitaire: round3(costs.get(key(line.produitId, line.magasinId))!.coutUnitaire) } });
    }
    for (const sale of sales) {
      let before = new Prisma.Decimal(0), after = new Prisma.Decimal(0);
      for (const line of sale.vente_lignes) {
        before = before.plus(line.prix_vente_total_ttc);
        const drawn = await drawLine(tx, sale.magasin_id, { produitId: line.produit_id, qteVendue: line.qte_vendue, prixVenteTtc: line.prix_vente_ttc }, year);
        for (const row of drawn) { await tx.vente_lignes.create({ data: { vente_id: sale.id, ...row } }); after = after.plus(row.prix_vente_total_ttc); }
      }
      if (!before.eq(after)) throw new ValidationException('La réaffectation modifierait un arrondi de vente. Opération annulée.');
    }
    await tx.stock_years.updateMany({ where: { annee: { gt: year } }, data: { needs_review: true } });
    await tx.$executeRaw`UPDATE analytics_snapshot_state SET statut='A_RECALCULER' WHERE annee>=${year}`;
    await audit.logUpdate(tx, { entityType: 'STOCK', actor, summary: 'Ouverture ' + year + ' : ' + (input.mode === 'CARRY' ? 'reprise de clôture' : 'quantités saisies, coûts de clôture conservés'), changes: { year, mode: input.mode, lines: lines.length, reallocatedSales: sales.length }, ...ctx });
    return { year, lines: lines.length, reallocatedSales: sales.length };
  }, { timeout: 60000 });
}
export async function closeYear(year: number, actor: CurrentUser, ctx: AuditContext) {
  if (year >= businessYear()) throw new ValidationException('La clôture définitive est disponible après le 31 décembre.');
  return prisma.$transaction(async tx => {
    await lockStockLedger(tx);
    const state = await tx.stock_years.findUnique({ where: { annee: year } });
    if (!state || state.statut !== 'OPEN' || state.needs_review) throw new ValidationException('Année non ouverte ou ouverture à revalider.');
    const rows = await closing(tx, year);
    if (rows.some(r => r.deficit > 0)) throw new ValidationException('Résolvez les déficits de stock avant de clôturer.');
    await tx.stock_years.update({ where: { annee: year }, data: { statut: 'CLOSED', closed_at: new Date() } });
    await tx.stock_years.updateMany({ where: { annee: { gt: year } }, data: { needs_review: true } });
    await audit.logUpdate(tx, { entityType: 'STOCK', actor, summary: 'Clôture annuelle ' + year, changes: { year, status: 'CLOSED' }, ...ctx });
    return { year, status: 'CLOSED' };
  }, { timeout: 30000 });
}
export async function reopenYear(year: number, actor: CurrentUser, ctx: AuditContext) {
  return prisma.$transaction(async tx => {
    await lockStockLedger(tx);
    const state = await tx.stock_years.findUnique({ where: { annee: year } });
    if (!state || state.statut !== 'CLOSED') throw new ValidationException('Cette année n’est pas clôturée.');
    await tx.stock_years.update({ where: { annee: year }, data: { statut: 'OPEN', closed_at: null } });
    await tx.stock_years.updateMany({ where: { annee: { gt: year } }, data: { needs_review: true } });
    await audit.logUpdate(tx, { entityType: 'STOCK', actor, summary: 'Réouverture annuelle ' + year + ' ; ouvertures suivantes à revalider', changes: { year, status: 'OPEN' }, ...ctx });
    return { year, status: 'OPEN' };
  });
}
