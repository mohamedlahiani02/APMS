import { z } from "zod";
import { pageQuerySchema } from "../common/pagination.js";

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format attendu : YYYY-MM-DD).");

export const venteLigneInputSchema = z.object({
  produitId: z.string().uuid(),
  qteVendue: z.number().positive(),
  prixVenteTtc: z.number().nonnegative(),
});

export const createVenteSchema = z.object({
  venteDate: isoDateSchema,
  magasinId: z.string().uuid(),
  lignes: z.array(venteLigneInputSchema).min(1),
});
export type CreateVenteInput = z.infer<typeof createVenteSchema>;

export const listVentesQuerySchema = pageQuerySchema.extend({
  magasinId: z.string().uuid().optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
});
export type ListVentesQuery = z.infer<typeof listVentesQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
