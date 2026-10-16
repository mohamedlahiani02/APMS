import { listOrder } from "../common/list-filters.js";
import { prisma, Prisma } from "../db.js";
import { toPagedResponse, type PagedResponse } from "../common/pagination.js";
import type { AuditQuery } from "./schemas.js";

export interface AuditLogItem {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  summary: string | null;
  changes: unknown;
  timestamp: string;
}

interface AuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_email: string | null;
  actor_role: string | null;
  summary: string | null;
  changes: unknown;
  timestamp: Date;
}

function toItem(row: AuditLogRow): AuditLogItem {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    summary: row.summary,
    changes: row.changes,
    timestamp: row.timestamp.toISOString(),
  };
}

/** `GET /audit?page&size&entityType&actorId` — paged, filterable, newest first. */
export async function listAuditLogs(
  query: AuditQuery,
): Promise<PagedResponse<AuditLogItem>> {
  const where: Prisma.audit_logsWhereInput = {
    ...(query.entityType ? { entity_type: query.entityType } : {}),
    ...(query.actorId ? { actor_id: query.actorId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.search
      ? { summary: { contains: query.search, mode: "insensitive" as const } }
      : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          timestamp: {
            ...(query.dateFrom
              ? { gte: new Date(query.dateFrom + "T00:00:00+01:00") }
              : {}),
            ...(query.dateTo
              ? {
                  lt: new Date(
                    new Date(query.dateTo + "T00:00:00+01:00").getTime() +
                      86400000,
                  ),
                }
              : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.audit_logs.findMany({
      where,
      orderBy: listOrder(
        query,
        {
          timestamp: "timestamp",
          action: "action",
          actorEmail: "actor_email",
          entityType: "entity_type",
        },
        "timestamp",
        "desc",
      ),
      skip: query.page * query.size,
      take: query.size,
    }),
    prisma.audit_logs.count({ where }),
  ]);

  return toPagedResponse(rows.map(toItem), total, query);
}

/**
 * `GET /audit/{entityType}/{entityId}` — unpaged array for one entity's full
 * history. Newest first, matching the paged list endpoint (not specified
 * either way in the task; chosen for consistency).
 */
export async function getEntityHistory(
  entityType: string,
  entityId: string,
): Promise<AuditLogItem[]> {
  const rows = await prisma.audit_logs.findMany({
    where: { entity_type: entityType, entity_id: entityId },
    orderBy: { timestamp: "desc" },
  });
  return rows.map(toItem);
}
