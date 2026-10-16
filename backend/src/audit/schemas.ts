import { dateRangeIsOrdered, dateRangeError } from "../common/date-schema.js";
import { z } from "zod";
import { isoDateSchema } from "../common/date-schema.js";
import { pageQuerySchema } from "../common/pagination.js";

/** `GET /audit?page&size&entityType&actorId` */
export const auditQuerySchema = pageQuerySchema
  .extend({
    entityType: z.string().trim().min(1).optional(),
    actorId: z.string().uuid().optional(),
    action: z
      .enum([
        "CREATE",
        "UPDATE",
        "DELETE",
        "LOGIN",
        "LOGIN_FAILED",
        "LOGOUT",
        "LOCK",
        "UNLOCK",
        "PASSWORD_RESET",
      ])
      .optional(),
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
  })
  .refine(dateRangeIsOrdered, dateRangeError);
export type AuditQuery = z.infer<typeof auditQuerySchema>;

/** `GET /audit/{entityType}/{entityId}` */
export const auditEntityParamsSchema = z.object({
  entityType: z.string().trim().min(1),
  entityId: z.string().uuid(),
});
export type AuditEntityParams = z.infer<typeof auditEntityParamsSchema>;
