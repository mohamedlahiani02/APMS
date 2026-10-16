import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { AuditContext } from "../common/audit.js";
import { lookupQuerySchema } from "../common/pagination.js";
import {
  createBlAchatSchema,
  updateBlAchatSchema,
  listBlAchatsQuerySchema,
  idParamSchema,
} from "./schemas.js";
import {
  createBlAchat,
  updateBlAchat,
  deleteBlAchat,
  getBlAchat,
  listBlAchats,
  lookupBlAchats,
} from "./service.js";

function auditCtx(request: FastifyRequest): AuditContext {
  return { ipAddress: request.ip, traceId: request.traceId };
}

/** `request.user` is always set once `authenticate` has run (it throws otherwise). */
function currentUser(request: FastifyRequest) {
  return request.user!;
}

export const registerBlAchatRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.authenticate);

  app.get("/bl-achats", async (request) => {
    const query = listBlAchatsQuerySchema.parse(request.query);
    return listBlAchats(query);
  });

  app.get("/bl-achats/lookup", async (request) => {
    const query = lookupQuerySchema.parse(request.query);
    return lookupBlAchats(query.q, query.limit);
  });

  app.get("/bl-achats/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return getBlAchat(id);
  });

  app.post("/bl-achats", async (request, reply) => {
    const body = createBlAchatSchema.parse(request.body);
    const result = await createBlAchat(body, currentUser(request), auditCtx(request));
    reply.status(201);
    return result;
  });

  app.put("/bl-achats/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = updateBlAchatSchema.parse(request.body);
    return updateBlAchat(id, body, currentUser(request), auditCtx(request));
  });

  app.delete("/bl-achats/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteBlAchat(id, currentUser(request), auditCtx(request));
    reply.status(204);
  });
};
