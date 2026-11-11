import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
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

    if (/YEAR_(?:NOT_OPEN|CLOSED|OPENING_REVIEW_REQUIRED|STOCK_SOURCE_MISMATCH)/.test(error.message)) {
      return reply.status(409).send({ code: 'YEAR_NOT_WRITABLE', message: 'Année non ouverte, clôturée ou ouverture à revalider. Contactez un administrateur.', traceId });
    }
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

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return reply.status(409).send({ code: 'DUPLICATE_VALUE', message: 'Cette valeur existe déjà.', traceId });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return reply.status(422).send({ code: 'INVALID_REFERENCE', message: 'Une référence est invalide ou encore utilisée.', traceId });
    }
    const statusCode = (caught as Error & { statusCode?: number }).statusCode;
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
