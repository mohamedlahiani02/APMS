import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as service from './service.js';
const yearParams = z.object({ year: z.coerce.number().int().min(1970).max(2200) });
const opening = z.object({ mode: z.enum(['CARRY', 'MANUAL']), lignes: z.array(z.object({ produitId: z.string().uuid(), magasinId: z.string().uuid(), quantite: z.number().min(0).max(999999999.999).refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.0001, 'Trois décimales maximum.') })).max(20000).optional() }).refine(v => v.mode !== 'MANUAL' || v.lignes !== undefined, 'Saisissez les quantités.');
export const registerAnnualStockRoutes: FastifyPluginAsync = async app => {
  const admin = { preHandler: [app.authenticate, app.requireRole('ADMIN')] };
  app.get('/stock-years', admin, () => service.listYears());
  app.get('/stock-years/:year/closing', admin, request => service.getClosing(yearParams.parse(request.params).year));
  app.get('/stock-years/:year/opening', admin, request => service.getOpening(yearParams.parse(request.params).year));
  app.put('/stock-years/:year/opening', { ...admin, bodyLimit: 4 * 1024 * 1024 }, request => service.setOpening(yearParams.parse(request.params).year, opening.parse(request.body), request.user!, { ipAddress: request.ip, traceId: request.traceId }));
  app.post('/stock-years/:year/close', admin, request => service.closeYear(yearParams.parse(request.params).year, request.user!, { ipAddress: request.ip, traceId: request.traceId }));
  app.post('/stock-years/:year/reopen', admin, request => service.reopenYear(yearParams.parse(request.params).year, request.user!, { ipAddress: request.ip, traceId: request.traceId }));
};
