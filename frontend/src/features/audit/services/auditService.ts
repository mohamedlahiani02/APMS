import apiClient from '@/lib/api/client';
import type { AuditEntry } from '@/types';
import type { Page } from '@/types/api';
export async function listAudit(params: {
  page: number;
  size: number;
  entityType?: string;
  actorId?: string;
}): Promise<Page<AuditEntry>> {
  return (await apiClient.get<Page<AuditEntry>>('/audit', { params })).data;
}
export async function getEntityHistory(
  entityType: string,
  entityId: string,
): Promise<AuditEntry[]> {
  return (
    await apiClient.get<AuditEntry[]>(
      '/audit/' +
        encodeURIComponent(entityType) +
        '/' +
        encodeURIComponent(entityId),
    )
  ).data;
}
