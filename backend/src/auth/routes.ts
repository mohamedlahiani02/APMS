import type { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";
import { loginSchema, refreshSchema, logoutSchema, changePasswordSchema } from "./schemas.js";
import * as authService from "./service.js";

/**
 * Registers POST /auth/login|refresh|logout|change-password and GET /auth/me.
 * No `/api/v1` prefix here — added at central registration time.
 */
export const registerAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: config.LOGIN_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const result = await authService.login(body.email, body.password, {
        ipAddress: request.ip,
        traceId: request.traceId,
      });
      return reply.status(200).send(result);
    },
  );

  app.post("/auth/refresh", async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const result = await authService.refresh(body.refreshToken, {
      ipAddress: request.ip,
      traceId: request.traceId,
    });
    return reply.status(200).send(result);
  });

  app.post("/auth/logout", { preHandler: app.authenticate }, async (request, reply) => {
    const body = logoutSchema.parse(request.body);
    await authService.logout(body.refreshToken, request.user!, {
      ipAddress: request.ip,
      traceId: request.traceId,
    });
    return reply.status(204).send();
  });

  app.get("/auth/me", { preHandler: app.authenticate }, async (request, reply) => {
    const profile = await authService.getProfile(request.user!.id);
    return reply.status(200).send(profile);
  });

  app.post("/auth/change-password", { preHandler: app.authenticate }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body);
    await authService.changePassword(request.user!.id, body.currentPassword, body.newPassword, {
      ipAddress: request.ip,
      traceId: request.traceId,
    });
    return reply.status(204).send();
  });
};
