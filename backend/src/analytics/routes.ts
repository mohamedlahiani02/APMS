import type { FastifyPluginAsync } from "fastify";
import {
  annualReportQuerySchema,
  dashboardQuerySchema,
  drilldownParamsSchema,
  drilldownQuerySchema,
} from "./schemas.js";
import { getAnnualReport, getDashboard, getDrilldown } from "./service.js";

/** Analytics routes — ADMIN only, registered without the `/api/v1` prefix (added centrally). */
export const registerAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: [app.authenticate, app.requireRole("ADMIN")] };

  app.get("/analytics/dashboard", adminOnly, async (request) => {
    const query = dashboardQuerySchema.parse(request.query);
    return getDashboard(query.year, query.month);
  });

  app.get("/analytics/annual-report", adminOnly, async (request) => {
    const query = annualReportQuerySchema.parse(request.query);
    return getAnnualReport(query.year);
  });

  app.get("/analytics/drilldown/:dimension/:id", adminOnly, async (request) => {
    const params = drilldownParamsSchema.parse(request.params);
    const query = drilldownQuerySchema.parse(request.query);
    return getDrilldown(params.dimension, params.id, query.year, query.month);
  });
};
