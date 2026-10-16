import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
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
    try {
      request.user = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException("AUTH_INVALID_TOKEN", "Jeton invalide ou expiré.");
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
