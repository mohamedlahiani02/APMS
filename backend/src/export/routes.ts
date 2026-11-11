import { buildTableWorkbook, tableExportSchema } from './table.js';
import type { FastifyPluginAsync } from "fastify";
import { exportQuerySchema } from "./schemas.js";
import { buildTransactionsWorkbook } from "./service.js";

/**
 * Export routes — any authenticated user (ADMIN or SECRETAIRE), no documented
 * role restriction in the original. Registered without the `/api/v1` prefix
 * (added centrally).
 */
export const registerExportRoutes: FastifyPluginAsync = async (app) => {
  app.post('/tables/export/excel', { preHandler: [app.authenticate], bodyLimit: 20 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = tableExportSchema.parse(request.body);
    const buffer = await buildTableWorkbook(input);
    return reply.header('Cache-Control', 'no-store').header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition', 'attachment; filename="tableau-filtre.xlsx"').send(buffer);
  });
  app.get("/transactions/export/excel", { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = exportQuerySchema.parse(request.query);
    const buffer = await buildTransactionsWorkbook(query);

    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="transactions.xlsx"')
      .send(buffer);
  });
};
