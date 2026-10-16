import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { lookupQuerySchema } from "../common/pagination.js";
import { createFournisseurSchema, fournisseurListQuerySchema, updateFournisseurSchema } from "./schemas.js";
import {
  createFournisseur,
  deleteFournisseur,
  getFournisseur,
  listFournisseurs,
  lookupFournisseurs,
  updateFournisseur,
} from "./service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

/** `/fournisseurs` CRUD + lookup. Any authenticated user (ADMIN or SECRETAIRE) has full access. */
export const registerFournisseurRoutes: FastifyPluginAsync = async (app) => {
  app.get("/fournisseurs", { preHandler: app.authenticate }, async (request) => {
    const query = fournisseurListQuerySchema.parse(request.query);
    return listFournisseurs(query);
  });

  app.get("/fournisseurs/lookup", { preHandler: app.authenticate }, async (request) => {
    const query = lookupQuerySchema.parse(request.query);
    return lookupFournisseurs(query);
  });

  app.get("/fournisseurs/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getFournisseur(id);
  });

  app.post("/fournisseurs", { preHandler: app.authenticate }, async (request, reply) => {
    const data = createFournisseurSchema.parse(request.body);
    const result = await createFournisseur(data, request.user ?? null);
    reply.status(201);
    return result;
  });

  app.put("/fournisseurs/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const data = updateFournisseurSchema.parse(request.body);
    return updateFournisseur(id, data, request.user ?? null);
  });

  app.delete("/fournisseurs/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteFournisseur(id, request.user ?? null);
    reply.status(204).send();
  });
};
