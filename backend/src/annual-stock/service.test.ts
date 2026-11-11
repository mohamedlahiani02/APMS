import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, closeDb } from '../db.js';
import { createBlAchat } from '../bl-achats/service.js';
import { createVente } from '../ventes/service.js';
import { closeYear, getClosing, getOpening, reopenYear, setOpening } from './service.js';
import { buildApplication } from '../application.js';
import { signAccessToken } from '../plugins/auth.js';
import type { CurrentUser } from '../common/current-user.js';

const nonce = randomUUID().slice(0, 8);
let admin: CurrentUser, staff: CurrentUser;
let product: string, store: string, supplier: string, family: string;
let originalYears: Awaited<ReturnType<typeof prisma.stock_years.findMany>> = [];
const ctx = { traceId: 'annual-test-' + nonce };
const purchase = (year: number, qty: number, price: number) => createBlAchat({ transactionDate: year + '-01-02', blNumero: nonce + '-' + year + '-' + qty, magasinId: store, fournisseurId: supplier, lignes: [{ produitId: product, qteAchetee: qty, prixAchatNetHt: price, tauxTva: 19 }] }, admin, ctx);
const sale = (year: number, qty: number) => createVente({ venteDate: year + '-01-03', magasinId: store, lignes: [{ produitId: product, qteVendue: qty, prixVenteTtc: 300 }] }, admin, ctx);

beforeAll(async () => {
  originalYears = await prisma.stock_years.findMany();
  if (originalYears.some(y => [2023, 2024, 2025].includes(y.annee))) throw new Error('Annual test years must be unused.');
  for (const role of ['ADMIN', 'SECRETAIRE'] as const) {
    const user = await prisma.users.create({ data: { email: nonce + '-' + role + '@example.invalid', role, password_hash: 'no-login-fixture', must_change_password: false } });
    const actor = { id: user.id, email: user.email, role }; if (role === 'ADMIN') admin = actor; else staff = actor;
  }
  family = (await prisma.familles.create({ data: { code: nonce, nom: 'Annual ' + nonce } })).id;
  store = (await prisma.magasins.create({ data: { code: nonce, nom: 'Annual ' + nonce } })).id;
  supplier = (await prisma.fournisseurs.create({ data: { code: nonce, nom: 'Annual ' + nonce } })).id;
  product = (await prisma.produits.create({ data: { reference: nonce, designation: 'Annual fixture', famille_id: family } })).id;
  await prisma.stock_years.create({ data: { annee: 2023, mode: 'LEGACY' } });
  for (const year of [2023, 2024]) for (const day of [2, 3]) {
    const id = year * 10000 + 100 + day;
    await prisma.calendar.upsert({ where: { date_id: id }, update: {}, create: { date_id: id, date_full: new Date(year + '-01-0' + day), annee: year, mois: 1, trimestre: 1, semestre: 1, semaine: 1, jour_semaine: day, nom_mois: 'Janvier', nom_jour: 'Test', est_weekend: false } });
  }
});
afterAll(async () => {
  if (product) {
    await prisma.stock_years.updateMany({ data: { statut: 'OPEN', needs_review: false } });
    const sales = await prisma.ventes.findMany({ where: { vente_lignes: { some: { produit_id: product } } } });
    await prisma.vente_lignes.deleteMany({ where: { produit_id: product } });
    await prisma.ventes.deleteMany({ where: { id: { in: sales.map(s => s.id) } } });
    const buys = await prisma.bl_achats.findMany({ where: { magasin_id: store } });
    await prisma.bl_achat_lignes.deleteMany({ where: { produit_id: product } });
    await prisma.bl_achats.deleteMany({ where: { id: { in: buys.map(b => b.id) } } });
    await prisma.annual_stock_opening.deleteMany({ where: { annee: { in: [2024, 2025] } } });
    await prisma.stock_legacy_lots.deleteMany({ where: { produit_id: product } });
    await prisma.analytics_stock_snapshot.deleteMany({ where: { OR: [{ annee: { in: [2023, 2024, 2025] } }, { produit_id: product }] } });
    await prisma.analytics_snapshot_state.deleteMany({ where: { annee: { in: [2023, 2024, 2025] } } });
    await prisma.stock_years.deleteMany({ where: { annee: { in: [2023, 2024, 2025] } } });
    await prisma.produits.delete({ where: { id: product } });
    await prisma.magasins.delete({ where: { id: store } });
    await prisma.fournisseurs.delete({ where: { id: supplier } });
    await prisma.familles.delete({ where: { id: family } });
  }
  for (const year of originalYears) await prisma.stock_years.update({ where: { annee: year.annee }, data: { statut: year.statut, needs_review: year.needs_review, closed_at: year.closed_at } });
  if (admin) await prisma.audit_logs.deleteMany({ where: { actor_id: admin.id } });
  if (admin && staff) await prisma.users.deleteMany({ where: { id: { in: [admin.id, staff.id] } } });
  await closeDb();
});
describe('annual stock lifecycle', () => {
  it('closes, inherits costs with manual quantities, isolates years, revalidates after reopening and carries closing stock', async () => {
    await purchase(2023, 10, 100); await sale(2023, 4);
    expect((await getClosing(2023)).find(r => r.produitId === product)?.quantite).toBe(6);
    await closeYear(2023, admin, ctx);
    await expect(purchase(2023, 1, 100)).rejects.toThrow();
    await setOpening(2024, { mode: 'MANUAL', lignes: [{ produitId: product, magasinId: store, quantite: 3 }] }, admin, ctx);
    expect((await getOpening(2024)).lignes.find(r => r.produitId === product)).toMatchObject({ quantite: 3, coutUnitaire: 100 });
    await purchase(2024, 2, 200);
    const retained = await sale(2024, 4);
    expect(retained.lignes.some(l => l.sourceType === 'OPENING')).toBe(true);
    expect(retained.hasDepassement).toBe(false);
    expect((await getClosing(2024)).find(r => r.produitId === product)?.quantite).toBe(1);
    await reopenYear(2023, admin, ctx);
    expect((await getOpening(2024)).state?.needs_review).toBe(true);
    await expect(sale(2024, 1)).rejects.toThrow();
    await purchase(2023, 5, 200); await closeYear(2023, admin, ctx);
    await setOpening(2024, { mode: 'MANUAL', lignes: [{ produitId: product, magasinId: store, quantite: 3 }] }, admin, ctx);
    expect((await getOpening(2024)).lignes.find(r => r.produitId === product)?.coutUnitaire).toBeCloseTo(133.333, 3);
    const total = await prisma.vente_lignes.aggregate({ where: { vente_id: retained.id }, _sum: { qte_vendue: true, prix_vente_total_ttc: true } });
    expect(Number(total._sum.qte_vendue)).toBe(4); expect(Number(total._sum.prix_vente_total_ttc)).toBe(1200);
    await closeYear(2024, admin, ctx);
    await setOpening(2025, { mode: 'CARRY' }, admin, ctx);
    expect((await getOpening(2025)).lignes.find(r => r.produitId === product)).toMatchObject({ quantite: 1, coutUnitaire: 200 });
    await setOpening(2025, { mode: 'MANUAL', lignes: [{ produitId: product, magasinId: store, quantite: 0 }] }, admin, ctx);
    expect((await getClosing(2025)).find(r => r.produitId === product)).toMatchObject({ quantite: 0, coutUnitaire: 200 });
    await expect(setOpening(2025, { mode: 'MANUAL', lignes: [{ produitId: product, magasinId: store, quantite: 2 }, { produitId: product, magasinId: store, quantite: 3 }] }, admin, ctx)).rejects.toThrow('fois');
  });
  it('requires admin rights for annual controls and authentication for table exports', async () => {
    const app = await buildApplication();
    try {
      expect((await app.inject({ method: 'GET', url: '/api/v1/stock-years', headers: { authorization: 'Bearer ' + signAccessToken(staff) } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: '/api/v1/stock-years', headers: { authorization: 'Bearer ' + signAccessToken(admin) } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/api/v1/tables/export/excel', payload: { title: 'Test', columns: ['A'], rows: [[1]] } })).statusCode).toBe(401);
    } finally { await app.close(); }
  });
});
