import type { FastifyPluginAsync } from "fastify";
import { auditEntityParamsSchema, auditQuerySchema } from "./schemas.js";
import { getEntityHistory, listAuditLogs } from "./service.js";

/** Audit routes — ADMIN only, read-only, registered without the `/api/v1` prefix (added centrally). */
export const registerAuditRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: [app.authenticate, app.requireRole("ADMIN")] };

  app.get("/audit", adminOnly, async (request) => {
    const query = auditQuerySchema.parse(request.query);
    return listAuditLogs(query);
  });

  app.get("/audit/:entityType/:entityId", adminOnly, async (request) => {
    const params = auditEntityParamsSchema.parse(request.params);
    return getEntityHistory(params.entityType, params.entityId);
  });
};
