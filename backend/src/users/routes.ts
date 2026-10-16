import type { FastifyPluginAsync } from "fastify";
import { userListQuerySchema } from "./schemas.js";
import {
  createUserSchema,
  updateUserSchema,
  userIdParamsSchema,
} from "./schemas.js";
import * as usersService from "./service.js";

/**
 * Registers /users CRUD + reset-password/unlock. ADMIN only — guarded with
 * app.authenticate + app.requireRole("ADMIN") on every route in this plugin.
 * No `/api/v1` prefix — added at central registration time.
 */
export const registerUserRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireRole("ADMIN"));

  app.get("/users", async (request, reply) => {
    const query = userListQuerySchema.parse(request.query);
    const result = await usersService.listUsers(query);
    return reply.status(200).send(result);
  });

  app.post("/users", async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    const result = await usersService.createUser(body, request.user!, {
      ipAddress: request.ip,
      traceId: request.traceId,
    });
    return reply.status(201).send(result);
  });

  app.get("/users/:id", async (request, reply) => {
    const { id } = userIdParamsSchema.parse(request.params);
    const result = await usersService.getUser(id);
    return reply.status(200).send(result);
  });

  app.put("/users/:id", async (request, reply) => {
    const { id } = userIdParamsSchema.parse(request.params);
    const body = updateUserSchema.parse(request.body);
    const result = await usersService.updateUser(id, body, request.user!, {
      ipAddress: request.ip,
      traceId: request.traceId,
    });
    return reply.status(200).send(result);
  });

  app.delete("/users/:id", async (request, reply) => {
    const { id } = userIdParamsSchema.parse(request.params);
    await usersService.deleteUser(id, request.user!, {
      ipAddress: request.ip,
      traceId: request.traceId,
    });
    return reply.status(204).send();
  });

  app.post("/users/:id/reset-password", async (request, reply) => {
    const { id } = userIdParamsSchema.parse(request.params);
    const result = await usersService.resetPassword(id, request.user!, {
      ipAddress: request.ip,
      traceId: request.traceId,
    });
    return reply.status(200).send(result);
  });

  app.post("/users/:id/unlock", async (request, reply) => {
    const { id } = userIdParamsSchema.parse(request.params);
    await usersService.unlockUser(id, request.user!, {
      ipAddress: request.ip,
      traceId: request.traceId,
    });
    return reply.status(204).send();
  });
};
