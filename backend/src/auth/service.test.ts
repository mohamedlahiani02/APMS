import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db.js";
import { config } from "../config.js";
import * as authService from "./service.js";
import * as usersService from "../users/service.js";
import type { CurrentUser } from "../common/current-user.js";

/**
 * These tests hit the real local Postgres (shared with other agents' work). The auth
 * service talks to the top-level `prisma` client directly (not an injectable tx), by
 * design — LOGIN/LOGIN_FAILED/LOCK audit rows must survive even if a surrounding
 * request later fails. So instead of wrapping in a rolled-back transaction, each test
 * creates its own uniquely-emailed fixture user and explicitly deletes every row it
 * created (audit_logs, user_sessions, users) in an afterEach, leaving no trace.
 */

const TEST_PASSWORD = "CorrectHorse123";
const ctx = { ipAddress: "127.0.0.1", traceId: "test-trace" };

let currentUserId: string | undefined;

async function createTestUser(overrides: Partial<{ loginAttemptCount: number; lockedUntil: Date | null }> = {}) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  const email = `qa.auth.${randomUUID()}@apms.invalid`;
  const user = await prisma.users.create({
    data: {
      email,
      password_hash: passwordHash,
      first_name: "Test",
      last_name: "User",
      role: "SECRETAIRE",
      is_active: true,
      must_change_password: false,
      login_attempt_count: overrides.loginAttemptCount ?? 0,
      locked_until: overrides.lockedUntil ?? null,
    },
  });
  currentUserId = user.id;
  return user;
}

afterEach(async () => {
  if (!currentUserId) return;
  const id = currentUserId;
  currentUserId = undefined;
  await prisma.audit_logs.deleteMany({ where: { OR: [{ actor_id: id }, { entity_id: id }] } });
  await prisma.user_sessions.deleteMany({ where: { user_id: id } });
  await prisma.users.deleteMany({ where: { id } });
});

describe("auth service", () => {
  it("logs in successfully with correct credentials", async () => {
    const user = await createTestUser();

    const result = await authService.login(user.email, TEST_PASSWORD, ctx);

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user).toMatchObject({ id: user.id, email: user.email, role: "SECRETAIRE" });

    const refreshed = await prisma.users.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.login_attempt_count).toBe(0);
    expect(refreshed.locked_until).toBeNull();
    expect(refreshed.last_login_at).not.toBeNull();

    const sessionCount = await prisma.user_sessions.count({ where: { user_id: user.id } });
    expect(sessionCount).toBe(1);
  });

  it("rejects a wrong password without revealing whether the email exists", async () => {
    const user = await createTestUser();
    await expect(authService.login(user.email, "wrong-password", ctx)).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
    });
    await expect(authService.login("nobody-at-all@apms.invalid", "whatever", ctx)).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
    });
  });

  it("locks the account after reaching the configured attempt threshold, then unlocks it", async () => {
    const user = await createTestUser();
    const actor: CurrentUser = { id: user.id, email: user.email, role: "ADMIN" };

    for (let i = 0; i < config.LOGIN_LOCKOUT_ATTEMPTS; i++) {
      await expect(authService.login(user.email, "wrong-password", ctx)).rejects.toMatchObject({
        code: "AUTH_INVALID_CREDENTIALS",
      });
    }

    const locked = await prisma.users.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.locked_until).not.toBeNull();
    expect(locked.login_attempt_count).toBe(0);

    // Even the correct password is rejected while locked.
    await expect(authService.login(user.email, TEST_PASSWORD, ctx)).rejects.toMatchObject({
      code: "AUTH_ACCOUNT_LOCKED",
    });

    const lockAudit = await prisma.audit_logs.findFirst({
      where: { entity_id: user.id, action: "LOCK" },
    });
    expect(lockAudit).not.toBeNull();

    await usersService.unlockUser(user.id, actor, ctx);

    const unlocked = await prisma.users.findUniqueOrThrow({ where: { id: user.id } });
    expect(unlocked.locked_until).toBeNull();
    expect(unlocked.login_attempt_count).toBe(0);

    const result = await authService.login(user.email, TEST_PASSWORD, ctx);
    expect(result.accessToken).toEqual(expect.any(String));
  });

  it("rotates refresh tokens single-use: the old token is rejected after refresh", async () => {
    const user = await createTestUser();
    const loginResult = await authService.login(user.email, TEST_PASSWORD, ctx);

    const refreshed = await authService.refresh(loginResult.refreshToken, ctx);
    expect(refreshed.refreshToken).not.toBe(loginResult.refreshToken);

    await expect(authService.refresh(loginResult.refreshToken, ctx)).rejects.toMatchObject({
      code: "AUTH_TOKEN_REVOKED",
    });

    // The new token still works.
    const refreshedAgain = await authService.refresh(refreshed.refreshToken, ctx);
    expect(refreshedAgain.accessToken).toEqual(expect.any(String));
  });

  it("rejects an unknown/expired refresh token", async () => {
    await expect(authService.refresh("not-a-real-token", ctx)).rejects.toMatchObject({
      code: "AUTH_REFRESH_TOKEN_EXPIRED",
    });
  });

  it("change-password revokes every active session and invalidates the old password", async () => {
    const user = await createTestUser();
    await authService.login(user.email, TEST_PASSWORD, ctx);
    await authService.login(user.email, TEST_PASSWORD, ctx);

    const activeBefore = await prisma.user_sessions.count({ where: { user_id: user.id, revoked_at: null } });
    expect(activeBefore).toBe(2);

    await authService.changePassword(user.id, TEST_PASSWORD, "NewPassword456", ctx);

    const activeAfter = await prisma.user_sessions.count({ where: { user_id: user.id, revoked_at: null } });
    expect(activeAfter).toBe(0);

    await expect(authService.login(user.email, TEST_PASSWORD, ctx)).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
    });

    const result = await authService.login(user.email, "NewPassword456", ctx);
    expect(result.accessToken).toEqual(expect.any(String));
  });

  it("rejects change-password with a wrong current password", async () => {
    const user = await createTestUser();
    await expect(
      authService.changePassword(user.id, "wrong-current", "NewPassword456", ctx),
    ).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
  });
});
