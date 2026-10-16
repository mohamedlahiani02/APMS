import { z } from "zod";
import { pageQuerySchema } from "../common/pagination.js";

/** `GET /audit?page&size&entityType&actorId` */
export const auditQuerySchema = pageQuerySchema.extend({
  entityType: z.string().trim().min(1).optional(),
  actorId: z.string().uuid().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

/** `GET /audit/{entityType}/{entityId}` */
export const auditEntityParamsSchema = z.object({
  entityType: z.string().trim().min(1),
  entityId: z.string().uuid(),
});
export type AuditEntityParams = z.infer<typeof auditEntityParamsSchema>;
