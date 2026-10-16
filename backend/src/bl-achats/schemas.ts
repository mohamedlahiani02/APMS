import { z } from "zod";
import { pageQuerySchema } from "../common/pagination.js";

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format attendu : YYYY-MM-DD).");

export const blAchatLigneInputSchema = z.object({
  produitId: z.string().uuid(),
  qteAchetee: z.number().positive(),
  prixAchatNetHt: z.number().nonnegative(),
  tauxTva: z.union([z.literal(7), z.literal(13), z.literal(19)]),
});

export const createBlAchatSchema = z.object({
  transactionDate: isoDateSchema,
  blNumero: z.string().trim().min(1).max(50),
  magasinId: z.string().uuid(),
  fournisseurId: z.string().uuid(),
  lignes: z.array(blAchatLigneInputSchema).min(1),
});
export type CreateBlAchatInput = z.infer<typeof createBlAchatSchema>;

export const updateBlAchatSchema = z.object({
  transactionDate: isoDateSchema.optional(),
  blNumero: z.string().trim().min(1).max(50).optional(),
  magasinId: z.string().uuid().optional(),
  fournisseurId: z.string().uuid().optional(),
  lignes: z.array(blAchatLigneInputSchema).min(1).optional(),
});
export type UpdateBlAchatInput = z.infer<typeof updateBlAchatSchema>;

export const listBlAchatsQuerySchema = pageQuerySchema.extend({
  magasinId: z.string().uuid().optional(),
  fournisseurId: z.string().uuid().optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
});
export type ListBlAchatsQuery = z.infer<typeof listBlAchatsQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
