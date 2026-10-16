import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type { Prisma, users as UserRow } from "@prisma/client";
import { prisma } from "../db.js";
import { audit, type AuditContext } from "../common/audit.js";
import { ResourceNotFoundException } from "../common/errors.js";
import type { CurrentUser, Role } from "../common/current-user.js";
import { toPagedResponse, type PageQuery, type PagedResponse } from "../common/pagination.js";
import type { CreateUserInput, UpdateUserInput } from "./schemas.js";

const BCRYPT_COST = 12;

export interface UserDetailResponse {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

function toUserDetail(user: UserRow): UserDetailResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role as Role,
    isActive: user.is_active,
    mustChangePassword: user.must_change_password,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  };
}

async function findActiveUserOrThrow(id: string): Promise<UserRow> {
  const user = await prisma.users.findFirst({ where: { id, deleted_at: null } });
  if (!user) {
    throw new ResourceNotFoundException("USER", id);
  }
  return user;
}

export async function listUsers(query: PageQuery): Promise<PagedResponse<UserDetailResponse>> {
  const where: Prisma.usersWhereInput = { deleted_at: null };
  if (query.search) {
    where.OR = [
      { email: { contains: query.search, mode: "insensitive" } },
      { first_name: { contains: query.search, mode: "insensitive" } },
      { last_name: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.users.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: query.page * query.size,
      take: query.size,
    }),
    prisma.users.count({ where }),
  ]);

  return toPagedResponse(rows.map(toUserDetail), total, query);
}

export async function getUser(id: string): Promise<UserDetailResponse> {
  return toUserDetail(await findActiveUserOrThrow(id));
}

export async function createUser(
  input: CreateUserInput,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<UserDetailResponse> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        email: input.email,
        password_hash: passwordHash,
        first_name: input.firstName,
        last_name: input.lastName,
        role: input.role,
        is_active: true,
        must_change_password: true,
        created_by: actor.id,
      },
    });
    await audit.logCreate(tx, {
      entityType: "USER",
      entityId: user.id,
      actor,
      summary: `Création de l'utilisateur ${user.email}`,
      ipAddress: ctx.ipAddress,
      traceId: ctx.traceId,
    });
    return user;
  });

  return toUserDetail(created);
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<UserDetailResponse> {
  const existing = await findActiveUserOrThrow(id);

  const data: Prisma.usersUncheckedUpdateInput = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (input.email !== undefined && input.email !== existing.email) {
    data.email = input.email;
    changes.email = { from: existing.email, to: input.email };
  }
  if (input.firstName !== undefined && input.firstName !== existing.first_name) {
    data.first_name = input.firstName;
    changes.firstName = { from: existing.first_name, to: input.firstName };
  }
  if (input.lastName !== undefined && input.lastName !== existing.last_name) {
    data.last_name = input.lastName;
    changes.lastName = { from: existing.last_name, to: input.lastName };
  }
  if (input.role !== undefined && input.role !== existing.role) {
    data.role = input.role;
    changes.role = { from: existing.role, to: input.role };
  }
  if (input.isActive !== undefined && input.isActive !== existing.is_active) {
    data.is_active = input.isActive;
    changes.isActive = { from: existing.is_active, to: input.isActive };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.users.update({
      where: { id },
      data: { ...data, updated_by: actor.id },
    });
    await audit.logUpdate(tx, {
      entityType: "USER",
      entityId: id,
      actor,
      summary: `Mise à jour de l'utilisateur ${existing.email}`,
      changes,
      ipAddress: ctx.ipAddress,
      traceId: ctx.traceId,
    });
    return user;
  });

  return toUserDetail(updated);
}

export async function deleteUser(id: string, actor: CurrentUser, ctx: AuditContext): Promise<void> {
  const existing = await findActiveUserOrThrow(id);

  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: actor.id },
    });
    await audit.logDelete(tx, {
      entityType: "USER",
      entityId: id,
      actor,
      summary: `Suppression de l'utilisateur ${existing.email}`,
      ipAddress: ctx.ipAddress,
      traceId: ctx.traceId,
    });
  });
}

const TEMP_PASSWORD_LENGTH = 12;
const TEMP_PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_PASSWORD_LOWER = "abcdefghijkmnopqrstuvwxyz";
const TEMP_PASSWORD_DIGITS = "23456789";

function randomChar(set: string): string {
  return set[crypto.randomInt(set.length)]!;
}

/** 12-char temporary password, mixed case + digits — returned in plaintext exactly once. */
function generateTemporaryPassword(): string {
  const all = TEMP_PASSWORD_UPPER + TEMP_PASSWORD_LOWER + TEMP_PASSWORD_DIGITS;
  const chars = [
    randomChar(TEMP_PASSWORD_UPPER),
    randomChar(TEMP_PASSWORD_LOWER),
    randomChar(TEMP_PASSWORD_DIGITS),
  ];
  while (chars.length < TEMP_PASSWORD_LENGTH) {
    chars.push(randomChar(all));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

export async function resetPassword(
  id: string,
  actor: CurrentUser,
  ctx: AuditContext,
): Promise<{ temporaryPassword: string }> {
  const existing = await findActiveUserOrThrow(id);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);

  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id },
      data: { password_hash: passwordHash, must_change_password: true, updated_by: actor.id },
    });
    await tx.user_sessions.updateMany({
      where: { user_id: id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    await audit.logPasswordReset(tx, {
      entityId: id,
      actor,
      summary: `Réinitialisation du mot de passe de ${existing.email}`,
      ipAddress: ctx.ipAddress,
      traceId: ctx.traceId,
    });
  });

  return { temporaryPassword };
}

export async function unlockUser(id: string, actor: CurrentUser, ctx: AuditContext): Promise<void> {
  const existing = await findActiveUserOrThrow(id);

  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id },
      data: { locked_until: null, login_attempt_count: 0, updated_by: actor.id },
    });
    await audit.logUnlock(tx, {
      entityId: id,
      actor,
      summary: `Déverrouillage du compte ${existing.email}`,
      ipAddress: ctx.ipAddress,
      traceId: ctx.traceId,
    });
  });
}
