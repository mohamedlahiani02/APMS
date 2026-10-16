import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { AuditContext } from "../common/audit.js";
import { createVenteSchema, listVentesQuerySchema, idParamSchema } from "./schemas.js";
import { createVente, updateVente, deleteVente, getVente, listVentes } from "./service.js";

function auditCtx(request: FastifyRequest): AuditContext {
  return { ipAddress: request.ip, traceId: request.traceId };
}

/** `request.user` is always set once `authenticate` has run (it throws otherwise). */
function currentUser(request: FastifyRequest) {
  return request.user!;
}

export const registerVenteRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/ventes", async (request) => {
    const query = listVentesQuerySchema.parse(request.query);
    return listVentes(query);
  });

  app.get("/ventes/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getVente(id);
  });

  app.post("/ventes", async (request, reply) => {
    const body = createVenteSchema.parse(request.body);
    const result = await createVente(body, currentUser(request), auditCtx(request));
    reply.status(201);
    return result;
  });

  app.put("/ventes/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = createVenteSchema.parse(request.body);
    return updateVente(id, body, currentUser(request), auditCtx(request));
  });

  app.delete("/ventes/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteVente(id, currentUser(request), auditCtx(request));
    reply.status(204);
  });
};
