import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { lookupQuerySchema } from "../common/pagination.js";
import { createFamilleSchema, familleListQuerySchema, updateFamilleSchema } from "./schemas.js";
import { createFamille, deleteFamille, getFamille, listFamilles, lookupFamilles, updateFamille } from "./service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

/** `/familles` CRUD + lookup. Any authenticated user (ADMIN or SECRETAIRE) has full access. */
export const registerFamilleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/familles", { preHandler: app.authenticate }, async (request) => {
    const query = familleListQuerySchema.parse(request.query);
    return listFamilles(query);
  });

  app.get("/familles/lookup", { preHandler: app.authenticate }, async (request) => {
    const query = lookupQuerySchema.parse(request.query);
    return lookupFamilles(query);
  });

  app.get("/familles/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getFamille(id);
  });

  app.post("/familles", { preHandler: app.authenticate }, async (request, reply) => {
    const data = createFamilleSchema.parse(request.body);
    const result = await createFamille(data, request.user ?? null);
    reply.status(201);
    return result;
  });

  app.put("/familles/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const data = updateFamilleSchema.parse(request.body);
    return updateFamille(id, data, request.user ?? null);
  });

  app.delete("/familles/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteFamille(id, request.user ?? null);
    reply.status(204).send();
  });
};
