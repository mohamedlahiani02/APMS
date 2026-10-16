import { dateRangeIsOrdered, dateRangeError } from "../common/date-schema.js";
import { z } from "zod";
import { pageQuerySchema } from "../common/pagination.js";

import { isoDateSchema } from "../common/date-schema.js";
export { isoDateSchema };

export const venteLigneInputSchema = z.object({
  produitId: z.string().uuid(),
  qteVendue: z.number().min(0.001).max(999999999.999),
  prixVenteTtc: z.number().min(0.001).max(999999999.999),
});

export const createVenteSchema = z.object({
  venteDate: isoDateSchema,
  magasinId: z.string().uuid(),
  lignes: z.array(venteLigneInputSchema).min(1),
});
export type CreateVenteInput = z.infer<typeof createVenteSchema>;

export const listVentesQuerySchema = pageQuerySchema
  .extend({
    hasDepassement: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    magasinId: z.string().uuid().optional(),
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
  })
  .refine(dateRangeIsOrdered, dateRangeError);
export type ListVentesQuery = z.infer<typeof listVentesQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
