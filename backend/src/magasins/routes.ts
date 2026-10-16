import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { lookupQuerySchema } from "../common/pagination.js";
import { createMagasinSchema, magasinListQuerySchema, updateMagasinSchema } from "./schemas.js";
import {
  createMagasin,
  deleteMagasin,
  getMagasin,
  listMagasins,
  lookupMagasins,
  updateMagasin,
} from "./service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

/** `/magasins` CRUD + lookup. Any authenticated user (ADMIN or SECRETAIRE) has full access. */
export const registerMagasinRoutes: FastifyPluginAsync = async (app) => {
  app.get("/magasins", { preHandler: app.authenticate }, async (request) => {
    const query = magasinListQuerySchema.parse(request.query);
    return listMagasins(query);
  });

  app.get("/magasins/lookup", { preHandler: app.authenticate }, async (request) => {
    const query = lookupQuerySchema.parse(request.query);
    return lookupMagasins(query);
  });

  app.get("/magasins/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getMagasin(id);
  });

  app.post("/magasins", { preHandler: app.authenticate }, async (request, reply) => {
    const data = createMagasinSchema.parse(request.body);
    const result = await createMagasin(data, request.user ?? null);
    reply.status(201);
    return result;
  });

  app.put("/magasins/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const data = updateMagasinSchema.parse(request.body);
    return updateMagasin(id, data, request.user ?? null);
  });

  app.delete("/magasins/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteMagasin(id, request.user ?? null);
    reply.status(204).send();
  });
};
