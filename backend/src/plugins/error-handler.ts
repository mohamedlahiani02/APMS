import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { ApmsException, DomainException } from "../common/errors.js";

interface ApiErrorBody {
  code: string;
  message: string;
  traceId: string;
  details?: unknown;
}

export const errorHandlerPlugin: FastifyPluginAsync = fp(async (app) => {
  app.setErrorHandler((caught, request, reply) => {
    const traceId = request.traceId;
    const error = caught as Error & { statusCode?: number };

    if (error instanceof DomainException) {
      request.log.warn(
        { code: error.code, traceId, context: error.context },
        `[BUSINESS] ${error.code}`,
      );
      const body: ApiErrorBody = { code: error.code, message: error.message, traceId };
      reply.status(error.httpStatus).send(body);
      return;
    }

    if (error instanceof ApmsException) {
      const body: ApiErrorBody = { code: error.code, message: error.message, traceId };
      reply.status(error.httpStatus).send(body);
      return;
    }

    if (error instanceof ZodError) {
      const body: ApiErrorBody = {
        code: "VALIDATION_ERROR",
        message: "Requête invalide.",
        traceId,
        details: error.flatten(),
      };
      reply.status(400).send(body);
      return;
    }

    const statusCode = error.statusCode;
    if (statusCode && statusCode < 500) {
      const body: ApiErrorBody = { code: "BAD_REQUEST", message: error.message, traceId };
      reply.status(statusCode).send(body);
      return;
    }

    request.log.error({ err: error, traceId }, "Unhandled error");
    const body: ApiErrorBody = {
      code: "INTERNAL_ERROR",
      message: "Une erreur interne est survenue.",
      traceId,
    };
    reply.status(500).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ApiErrorBody = {
      code: "ROUTE_NOT_FOUND",
      message: "Ressource introuvable.",
      traceId: request.traceId,
    };
    reply.status(404).send(body);
  });
});
