import { z } from "zod";
import { pageQuerySchema } from "../common/pagination.js";

/** `GET /stock?page&size&search&magasinId` */
export const stockQuerySchema = pageQuerySchema.extend({
  annee: z.coerce.number().int().min(1970).max(2200).optional(),
  magasinId: z.string().uuid().optional(),
  familleId: z.string().uuid().optional(),
  availability: z.enum(["positive", "zero"]).optional(),
});
export type StockQuery = z.infer<typeof stockQuerySchema>;
