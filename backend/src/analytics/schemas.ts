import { z } from "zod";

/** `GET /analytics/dashboard?year&month` */
export const dashboardQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

/** `GET /analytics/annual-report?year` */
export const annualReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});
export type AnnualReportQuery = z.infer<typeof annualReportQuerySchema>;

/** `GET /analytics/drilldown/{familles|fournisseurs|magasins}/{id}?year&month` */
export const drilldownParamsSchema = z.object({
  dimension: z.enum(["familles", "fournisseurs", "magasins"]),
  id: z.string().uuid(),
});
export type DrilldownParams = z.infer<typeof drilldownParamsSchema>;
export type DrilldownDimension = DrilldownParams["dimension"];

export const drilldownQuerySchema = dashboardQuerySchema;
export type DrilldownQuery = z.infer<typeof drilldownQuerySchema>;
