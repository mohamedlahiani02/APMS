import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db.js";
import * as usersService from "./service.js";
import * as authService from "../auth/service.js";
import type { CurrentUser } from "../common/current-user.js";

/**
 * Hits the real local Postgres. Every row created by a test (users, user_sessions,
 * audit_logs) is tracked and explicitly deleted in afterEach — see the note in
 * ../auth/service.test.ts for why we don't use a rolled-back transaction here.
 */

const ctx = { ipAddress: "127.0.0.1", traceId: "test-trace" };
const createdUserIds: string[] = [];

async function createFixtureAdmin(): Promise<CurrentUser> {
  const email = `qa.admin.${randomUUID()}@apms.invalid`;
  const user = await prisma.users.create({
    data: {
      email,
      password_hash: await bcrypt.hash("irrelevant-not-used-123", 12),
      first_name: "Fixture",
      last_name: "Admin",
      role: "ADMIN",
      is_active: true,
      must_change_password: false,
    },
  });
  createdUserIds.push(user.id);
  return { id: user.id, email: user.email, role: "ADMIN" };
}

afterEach(async () => {
  const ids = createdUserIds.splice(0, createdUserIds.length);
  if (ids.length === 0) return;
  await prisma.audit_logs.deleteMany({
    where: { OR: [{ actor_id: { in: ids } }, { entity_id: { in: ids } }] },
  });
  await prisma.user_sessions.deleteMany({ where: { user_id: { in: ids } } });
  await prisma.users.deleteMany({ where: { id: { in: ids } } });
});

describe("users service", () => {
  it("creates, reads, updates and soft-deletes a user", async () => {
    const admin = await createFixtureAdmin();
    const email = `qa.crud.${randomUUID()}@apms.invalid`;

    const created = await usersService.createUser(
      { email, firstName: "Jane", lastName: "Doe", role: "SECRETAIRE", password: "InitialPass123" },
      admin,
      ctx,
    );
    createdUserIds.push(created.id);

    expect(created).toMatchObject({ email, firstName: "Jane", lastName: "Doe", role: "SECRETAIRE" });
    expect(created.mustChangePassword).toBe(true);
    expect(created.isActive).toBe(true);

    const fetched = await usersService.getUser(created.id);
    expect(fetched).toMatchObject({ email, firstName: "Jane" });

    const updated = await usersService.updateUser(
      created.id,
      { firstName: "Janet", isActive: false },
      admin,
      ctx,
    );
    expect(updated).toMatchObject({ firstName: "Janet", isActive: false, lastName: "Doe" });

    const updateAudit = await prisma.audit_logs.findFirst({
      where: { entity_id: created.id, action: "UPDATE" },
    });
    expect(updateAudit?.changes).toMatchObject({
      firstName: { from: "Jane", to: "Janet" },
      isActive: { from: true, to: false },
    });

    await usersService.deleteUser(created.id, admin, ctx);
    await expect(usersService.getUser(created.id)).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
  });

  it("finds a created user via listUsers search", async () => {
    const admin = await createFixtureAdmin();
    const uniqueFirstName = `Findme${randomUUID().slice(0, 8)}`;
    const created = await usersService.createUser(
      {
        email: `qa.search.${randomUUID()}@apms.invalid`,
        firstName: uniqueFirstName,
        lastName: "Searchable",
        role: "SECRETAIRE",
        password: "InitialPass123",
      },
      admin,
      ctx,
    );
    createdUserIds.push(created.id);

    const page = await usersService.listUsers({ page: 0, size: 20, search: uniqueFirstName });
    expect(page.content).toHaveLength(1);
    expect(page.content[0]).toMatchObject({ id: created.id });
    expect(page.page.totalElements).toBe(1);
  });

  it("reset-password returns a temporary password that can actually be used to log in", async () => {
    const admin = await createFixtureAdmin();
    const created = await usersService.createUser(
      {
        email: `qa.reset.${randomUUID()}@apms.invalid`,
        firstName: "Reset",
        lastName: "Me",
        role: "SECRETAIRE",
        password: "InitialPass123",
      },
      admin,
      ctx,
    );
    createdUserIds.push(created.id);

    // Establish a session so we can assert reset-password revokes it too.
    await authService.login(created.email, "InitialPass123", ctx);
    const activeBefore = await prisma.user_sessions.count({
      where: { user_id: created.id, revoked_at: null },
    });
    expect(activeBefore).toBe(1);

    const { temporaryPassword } = await usersService.resetPassword(created.id, admin, ctx);
    expect(temporaryPassword).toHaveLength(12);

    const activeAfter = await prisma.user_sessions.count({
      where: { user_id: created.id, revoked_at: null },
    });
    expect(activeAfter).toBe(0);

    const loginResult = await authService.login(created.email, temporaryPassword, ctx);
    expect(loginResult.user.mustChangePassword).toBe(true);

    await expect(authService.login(created.email, "InitialPass123", ctx)).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
    });
  });

  it("unlocks a locked account", async () => {
    const admin = await createFixtureAdmin();
    const created = await usersService.createUser(
      {
        email: `qa.unlock.${randomUUID()}@apms.invalid`,
        firstName: "Locked",
        lastName: "Out",
        role: "SECRETAIRE",
        password: "InitialPass123",
      },
      admin,
      ctx,
    );
    createdUserIds.push(created.id);

    await prisma.users.update({
      where: { id: created.id },
      data: { locked_until: new Date(Date.now() + 60 * 60 * 1000), login_attempt_count: 5 },
    });

    await usersService.unlockUser(created.id, admin, ctx);

    const row = await prisma.users.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.locked_until).toBeNull();
    expect(row.login_attempt_count).toBe(0);
  });
});
