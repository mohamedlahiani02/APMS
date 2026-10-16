import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { lookupQuerySchema } from "../common/pagination.js";
import { createProduitSchema, produitListQuerySchema, updateProduitSchema } from "./schemas.js";
import {
  createProduit,
  deleteProduit,
  getProduit,
  listProduits,
  lookupProduits,
  updateProduit,
} from "./service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

/** `/produits` CRUD + lookup. Any authenticated user (ADMIN or SECRETAIRE) has full access. */
export const registerProduitRoutes: FastifyPluginAsync = async (app) => {
  app.get("/produits", { preHandler: app.authenticate }, async (request) => {
    const query = produitListQuerySchema.parse(request.query);
    return listProduits(query);
  });

  app.get("/produits/lookup", { preHandler: app.authenticate }, async (request) => {
    const query = lookupQuerySchema.parse(request.query);
    return lookupProduits(query);
  });

  app.get("/produits/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getProduit(id);
  });

  app.post("/produits", { preHandler: app.authenticate }, async (request, reply) => {
    const data = createProduitSchema.parse(request.body);
    const result = await createProduit(data, request.user ?? null);
    reply.status(201);
    return result;
  });

  app.put("/produits/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const data = updateProduitSchema.parse(request.body);
    return updateProduit(id, data, request.user ?? null);
  });

  app.delete("/produits/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteProduit(id, request.user ?? null);
    reply.status(204).send();
  });
};
