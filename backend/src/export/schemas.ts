import { z } from "zod";

/** `GET /transactions/export/excel?magasinId&dateFrom&dateTo` */
export const exportQuerySchema = z.object({
  magasinId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
