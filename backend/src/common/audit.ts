import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type { CurrentUser } from "./current-user.js";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "LOCK"
  | "UNLOCK"
  | "PASSWORD_RESET";

/** Request-scoped fields the old Java MDC filter injected automatically; pass explicitly here. */
export interface AuditContext {
  ipAddress?: string;
  traceId?: string;
}

interface WriteAuditParams extends AuditContext {
  entityType: string;
  entityId?: string | null;
  action: AuditAction;
  actor: CurrentUser | null;
  summary: string;
  changes?: Record<string, unknown>;
}

/** Prisma delegate type usable both as the top-level client and inside $transaction. */
type Db = Pick<typeof prisma, "audit_logs">;

async function writeAudit(db: Db, params: WriteAuditParams): Promise<void> {
  await db.audit_logs.create({
    data: {
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      action: params.action,
      actor_id: params.actor?.id ?? null,
      actor_email: params.actor?.email ?? null,
      actor_role: params.actor?.role ?? null,
      summary: params.summary,
      changes: (params.changes as Prisma.InputJsonValue) ?? undefined,
      ip_address: params.ipAddress,
      trace_id: params.traceId,
    },
  });
}

/**
 * CREATE/UPDATE/DELETE audit rows ride the caller's transaction (pass `tx`, the
 * Prisma.TransactionClient, so a rollback also rolls back the audit row) — mirrors
 * the Java `@Transactional(REQUIRED)` entries.
 */
export const audit = {
  async logCreate(tx: Db, p: Omit<WriteAuditParams, "action">): Promise<void> {
    await writeAudit(tx, { ...p, action: "CREATE" });
  },
  async logUpdate(tx: Db, p: Omit<WriteAuditParams, "action">): Promise<void> {
    await writeAudit(tx, { ...p, action: "UPDATE" });
  },
  async logDelete(tx: Db, p: Omit<WriteAuditParams, "action">): Promise<void> {
    await writeAudit(tx, { ...p, action: "DELETE" });
  },

  /**
   * LOGIN/LOGIN_FAILED/LOGOUT/LOCK always use the top-level `prisma` client, never a
   * passed-in `tx` — mirrors Java's `@Transactional(REQUIRES_NEW)`: these persist even
   * if the surrounding request/transaction later fails or rolls back.
   */
  async logLogin(p: Omit<WriteAuditParams, "action" | "entityType">): Promise<void> {
    await writeAudit(prisma, { ...p, entityType: "AUTH", action: "LOGIN" });
  },
  async logLoginFailed(p: Omit<WriteAuditParams, "action" | "entityType">): Promise<void> {
    await writeAudit(prisma, { ...p, entityType: "AUTH", action: "LOGIN_FAILED" });
  },
  async logLogout(p: Omit<WriteAuditParams, "action" | "entityType">): Promise<void> {
    await writeAudit(prisma, { ...p, entityType: "AUTH", action: "LOGOUT" });
  },
  async logLock(p: Omit<WriteAuditParams, "action" | "entityType">): Promise<void> {
    await writeAudit(prisma, { ...p, entityType: "AUTH", action: "LOCK" });
  },
  async logUnlock(tx: Db, p: Omit<WriteAuditParams, "action" | "entityType">): Promise<void> {
    await writeAudit(tx, { ...p, entityType: "USER", action: "UNLOCK" });
  },
  async logPasswordReset(tx: Db, p: Omit<WriteAuditParams, "action" | "entityType">): Promise<void> {
    await writeAudit(tx, { ...p, entityType: "USER", action: "PASSWORD_RESET" });
  },
};
