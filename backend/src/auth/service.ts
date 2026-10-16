import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { prisma, Prisma } from "../db.js";
import { config } from "../config.js";
import { signAccessToken } from "../plugins/auth.js";
import { audit, type AuditContext } from "../common/audit.js";
import {
  accountLocked,
  invalidCredentials,
  refreshTokenExpired,
  tokenRevoked,
  ResourceNotFoundException,
  ValidationException,
} from "../common/errors.js";
import type { CurrentUser, Role } from "../common/current-user.js";

const BCRYPT_COST = 12;

type Tx = Prisma.TransactionClient;

export interface AuthUserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  mustChangePassword: boolean;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserProfile;
}

/** Minimal shape of a `users` row as returned by Prisma — enough for the mappers/logic below. */
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  login_attempt_count: number;
  locked_until: Date | null;
  must_change_password: boolean;
}

function toActor(user: UserRow): CurrentUser {
  return { id: user.id, email: user.email, role: user.role as Role };
}

function toAuthProfile(user: UserRow): AuthUserProfile {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role as Role,
    mustChangePassword: user.must_change_password,
  };
}

/** `dd/MM/yyyy HH:mm` in the Africa/Tunis timezone, used in the AUTH_ACCOUNT_LOCKED message. */
function formatLockedUntil(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Tunis",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateRefreshTokenRaw(): string {
  return crypto.randomBytes(64).toString("base64url");
}

/** Creates a new session row for `userId` inside `tx` and returns the raw (unhashed) refresh token. */
async function createSession(tx: Tx, userId: string, ipAddress?: string): Promise<string> {
  const refreshToken = generateRefreshTokenRaw();
  const expiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await tx.user_sessions.create({
    data: {
      user_id: userId,
      refresh_token_hash: hashToken(refreshToken),
      expires_at: expiresAt,
      ip_address: ipAddress,
    },
  });
  return refreshToken;
}

export async function login(email: string, password: string, ctx: AuditContext): Promise<LoginResult> {
  const user = await prisma.users.findFirst({ where: { email, deleted_at: null } });
  if (!user || !user.is_active) {
    throw invalidCredentials();
  }

  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    throw accountLocked(formatLockedUntil(user.locked_until));
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    const actor = toActor(user);
    const attempts = user.login_attempt_count + 1;
    if (attempts >= config.LOGIN_LOCKOUT_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + config.LOGIN_LOCKOUT_HOURS * 60 * 60 * 1000);
      await prisma.users.update({
        where: { id: user.id },
        data: { login_attempt_count: 0, locked_until: lockedUntil },
      });
      await audit.logLoginFailed({
        entityId: user.id,
        actor,
        summary: "Échec de connexion",
        ipAddress: ctx.ipAddress,
        traceId: ctx.traceId,
      });
      await audit.logLock({
        entityId: user.id,
        actor,
        summary: `Compte verrouillé jusqu'au ${formatLockedUntil(lockedUntil)}`,
        ipAddress: ctx.ipAddress,
        traceId: ctx.traceId,
      });
    } else {
      await prisma.users.update({ where: { id: user.id }, data: { login_attempt_count: attempts } });
      await audit.logLoginFailed({
        entityId: user.id,
        actor,
        summary: "Échec de connexion",
        ipAddress: ctx.ipAddress,
        traceId: ctx.traceId,
      });
    }
    throw invalidCredentials();
  }

  const actor = toActor(user);
  const refreshToken = await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id: user.id },
      data: { login_attempt_count: 0, locked_until: null, last_login_at: new Date() },
    });
    return createSession(tx, user.id, ctx.ipAddress);
  });

  await audit.logLogin({
    entityId: user.id,
    actor,
    summary: "Connexion réussie",
    ipAddress: ctx.ipAddress,
    traceId: ctx.traceId,
  });

  return {
    accessToken: signAccessToken(actor),
    refreshToken,
    user: toAuthProfile(user),
  };
}

export async function refresh(refreshTokenRaw: string, ctx: AuditContext): Promise<LoginResult> {
  const hash = hashToken(refreshTokenRaw);
  const session = await prisma.user_sessions.findUnique({ where: { refresh_token_hash: hash } });
  if (!session || session.expires_at.getTime() < Date.now()) {
    throw refreshTokenExpired();
  }
  if (session.revoked_at) {
    throw tokenRevoked();
  }

  const { newRefreshToken, user } = await prisma.$transaction(async (tx) => {
    const claimed = await tx.user_sessions.updateMany({
      where: { id: session.id, revoked_at: null, expires_at: { gt: new Date() } },
      data: { revoked_at: new Date() },
    });
    if (claimed.count !== 1) throw tokenRevoked();
    const user = await tx.users.findFirst({ where: { id: session.user_id, deleted_at: null, is_active: true } });
    if (!user) throw tokenRevoked();
    if (user.locked_until && user.locked_until.getTime() > Date.now()) throw accountLocked(formatLockedUntil(user.locked_until));
    const newRefreshToken = await createSession(tx, session.user_id, ctx.ipAddress);
    return { newRefreshToken, user };
  });

  const actor = toActor(user);
  return {
    accessToken: signAccessToken(actor),
    refreshToken: newRefreshToken,
    user: toAuthProfile(user),
  };
}

export async function logout(refreshTokenRaw: string, actor: CurrentUser, ctx: AuditContext): Promise<void> {
  const hash = hashToken(refreshTokenRaw);
  const session = await prisma.user_sessions.findUnique({ where: { refresh_token_hash: hash } });
  if (session && session.user_id === actor.id && !session.revoked_at) {
    await prisma.user_sessions.update({ where: { id: session.id }, data: { revoked_at: new Date() } });
  }
  await audit.logLogout({
    entityId: actor.id,
    actor,
    summary: "Déconnexion",
    ipAddress: ctx.ipAddress,
    traceId: ctx.traceId,
  });
}

export async function getProfile(userId: string): Promise<AuthUserProfile> {
  const user = await prisma.users.findFirst({ where: { id: userId, deleted_at: null } });
  if (!user) {
    throw new ResourceNotFoundException("USER", userId);
  }
  return toAuthProfile(user);
}

function validatePasswordStrength(password: string): void {
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new ValidationException(
      "Le mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre.",
    );
  }
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ctx: AuditContext,
): Promise<void> {
  const user = await prisma.users.findFirst({ where: { id: userId, deleted_at: null } });
  if (!user) {
    throw new ResourceNotFoundException("USER", userId);
  }
  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    throw invalidCredentials();
  }
  validatePasswordStrength(newPassword);

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const actor = toActor(user);
  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id: user.id },
      data: { password_hash: passwordHash, must_change_password: false },
    });
    await tx.user_sessions.updateMany({
      where: { user_id: user.id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    await audit.logUpdate(tx, {
      entityType: "USER",
      entityId: user.id,
      actor,
      summary: "Mot de passe modifié",
      ipAddress: ctx.ipAddress,
      traceId: ctx.traceId,
    });
  });
}
