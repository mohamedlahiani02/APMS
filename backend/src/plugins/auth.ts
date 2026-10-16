import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { ForbiddenException, UnauthorizedException } from "../common/errors.js";
import type { CurrentUser, Role } from "../common/current-user.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: CurrentUser;
  }
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    requireRole: (...roles: Role[]) => preHandlerHookHandler;
  }
}

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: Role;
}

/** Signs a 15-minute (configurable) access token. Claims: sub (user id), email, role. */
export function signAccessToken(user: CurrentUser): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: `${config.JWT_ACCESS_TTL_MIN}m`,
  });
}

function verifyAccessToken(token: string): CurrentUser {
  const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] }) as AccessTokenClaims;
  return { id: decoded.sub, email: decoded.email, role: decoded.role };
}

/**
 * Decorates the app with `authenticate` (verifies the Bearer token, sets request.user,
 * 401 on anything invalid/missing) and `requireRole(...roles)` (403 if the authenticated
 * user's role isn't in the list). Public routes simply don't apply these preHandlers.
 */
export const authPlugin: FastifyPluginAsync = fp(async (app) => {
  app.decorate("authenticate", async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("AUTH_MISSING_TOKEN", "Authentification requise.");
    }
    const token = header.slice("Bearer ".length);
    let claims: CurrentUser;
    try {
      claims = verifyAccessToken(token);
      if (!claims.id || !['ADMIN', 'SECRETAIRE'].includes(claims.role)) throw new Error('Invalid claims');
    } catch {
      throw new UnauthorizedException("AUTH_INVALID_TOKEN", "Jeton invalide ou expiré.");
    }
    const user = await prisma.users.findFirst({ where: { id: claims.id, deleted_at: null, is_active: true } });
    if (!user || !['ADMIN', 'SECRETAIRE'].includes(user.role)) {
      throw new UnauthorizedException("AUTH_INVALID_TOKEN", "Compte inactif ou introuvable.");
    }
    request.user = { id: user.id, email: user.email, role: user.role as Role };
    const allowed = ['/api/v1/auth/me', '/api/v1/auth/change-password', '/api/v1/auth/logout'];
    if (user.must_change_password && !allowed.includes(request.url.split('?')[0]!)) {
      throw new ForbiddenException('Veuillez changer votre mot de passe avant de continuer.');
    }
  });

  app.decorate("requireRole", (...roles: Role[]): preHandlerHookHandler => {
    return async (request: FastifyRequest) => {
      if (!request.user || !roles.includes(request.user.role)) {
        throw new ForbiddenException();
      }
    };
  });
});
