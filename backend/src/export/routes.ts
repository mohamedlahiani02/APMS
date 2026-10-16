import type { FastifyPluginAsync } from "fastify";
import { exportQuerySchema } from "./schemas.js";
import { buildTransactionsWorkbook } from "./service.js";

/**
 * Export routes — any authenticated user (ADMIN or SECRETAIRE), no documented
 * role restriction in the original. Registered without the `/api/v1` prefix
 * (added centrally).
 */
export const registerExportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/transactions/export/excel", { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = exportQuerySchema.parse(request.query);
    const buffer = await buildTransactionsWorkbook(query);

    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="transactions.xlsx"')
      .send(buffer);
  });
};
