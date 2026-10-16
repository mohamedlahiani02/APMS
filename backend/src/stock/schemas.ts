import { z } from "zod";
import { pageQuerySchema } from "../common/pagination.js";

/** `GET /stock?page&size&search&magasinId` */
export const stockQuerySchema = pageQuerySchema.extend({
  magasinId: z.string().uuid().optional(),
});
export type StockQuery = z.infer<typeof stockQuerySchema>;
