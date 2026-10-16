import apiClient from "@/lib/api/client";
import type {
  AnnualReportResponse,
  DashboardKpiResponse,
  DrilldownResponse,
} from "@/types";

export interface AnalyticsScope {
  magasinId?: string;
  familleId?: string;
  fournisseurId?: string;
}
export interface PeriodQuery {
  year: number;
  month?: number;
}

export async function getDashboard(
  params: Required<PeriodQuery> & AnalyticsScope,
): Promise<DashboardKpiResponse> {
  const res = await apiClient.get<DashboardKpiResponse>(
    "/analytics/dashboard",
    { params },
  );
  return res.data;
}

export async function getAnnualReport(
  year: number,
): Promise<AnnualReportResponse> {
  const res = await apiClient.get<AnnualReportResponse>(
    "/analytics/annual-report",
    { params: { year } },
  );
  return res.data;
}

export type DrilldownEntity = "familles" | "fournisseurs" | "magasins";

export async function getDrilldown(
  entity: DrilldownEntity,
  id: string,
  params: Required<PeriodQuery> & AnalyticsScope,
): Promise<DrilldownResponse> {
  const res = await apiClient.get<DrilldownResponse>(
    `/analytics/drilldown/${entity}/${id}`,
    { params },
  );
  return res.data;
}
