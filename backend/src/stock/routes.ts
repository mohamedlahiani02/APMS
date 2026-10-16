import type { FastifyPluginAsync } from "fastify";
import { lookupQuerySchema, toPagedResponse } from "../common/pagination.js";
import { stockQuerySchema } from "./schemas.js";
import { listStock, lookupLegacyLots } from "./service.js";

/** Stock routes — ADMIN only, registered without the `/api/v1` prefix (added centrally). */
export const registerStockRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: [app.authenticate, app.requireRole("ADMIN")] };

  app.get("/stock", adminOnly, async (request) => {
    const query = stockQuerySchema.parse(request.query);
    const { content, total } = await listStock(query);
    return toPagedResponse(content, total, query);
  });

  app.get("/stock/legacy-lots/lookup", adminOnly, async (request) => {
    const query = lookupQuerySchema.parse(request.query);
    return lookupLegacyLots(query);
  });
};
