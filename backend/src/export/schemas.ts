import {
  dateRangeIsOrdered,
  dateRangeError,
  isoDateSchema,
} from "../common/date-schema.js";
import { z } from "zod";

/** `GET /transactions/export/excel?magasinId&dateFrom&dateTo` */
export const exportQuerySchema = z
  .object({
    type: z.enum(["achats", "ventes"]).optional(),
    search: z.string().trim().min(1).optional(),
    fournisseurId: z.string().uuid().optional(),
    consumed: z.enum(["yes", "no"]).optional(),
    hasDepassement: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    magasinId: z.string().uuid().optional(),
    dateFrom: isoDateSchema
      .transform((value) => new Date(value + "T00:00:00.000Z"))
      .optional(),
    dateTo: isoDateSchema
      .transform((value) => new Date(value + "T00:00:00.000Z"))
      .optional(),
  })
  .refine(dateRangeIsOrdered, dateRangeError);
export type ExportQuery = z.infer<typeof exportQuerySchema>;
