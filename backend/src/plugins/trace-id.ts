import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";

declare module "fastify" {
  interface FastifyRequest {
    traceId: string;
  }
}

/** Assigns/propagates a trace id (header X-Trace-Id) for every request, echoed on responses and in error bodies. */
export const traceIdPlugin: FastifyPluginAsync = fp(async (app) => {
  app.addHook("onRequest", async (request, reply) => {
    const incoming = request.headers["x-trace-id"];
    request.traceId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    reply.header("X-Trace-Id", request.traceId);
  });
});
