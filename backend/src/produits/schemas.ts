import { z } from "zod";
import { pageQuerySchema } from "../common/pagination.js";

/** List query: page/size/search (search = reference + designation) plus an optional `familleId` filter. */
export const produitListQuerySchema = pageQuerySchema.extend({
  familleId: z.string().uuid().optional(),
});
export type ProduitListQuery = z.infer<typeof produitListQuerySchema>;

/**
 * `reference` is required and immutable afterwards — never part of the update schema.
 * Uniqueness among non-deleted rows is enforced only going forward, on create (see
 * `produitReferenceDuplicate` in service.ts) — one historical duplicate already exists
 * in the restored production data and must not be retroactively flagged.
 */
export const createProduitSchema = z.object({
  reference: z.string().trim().min(1).max(50),
  designation: z.string().trim().min(1).max(200),
  familleId: z.string().uuid(),
  isActive: z.boolean().optional(),
});
export type CreateProduitRequest = z.infer<typeof createProduitSchema>;

/** Update schema intentionally omits `reference` entirely: it is immutable after creation. */
export const updateProduitSchema = z.object({
  designation: z.string().trim().min(1).max(200).optional(),
  familleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProduitRequest = z.infer<typeof updateProduitSchema>;

export interface ProduitResponse {
  id: string;
  reference: string;
  designation: string;
  familleId: string;
  familleNom: string;
  isActive: boolean;
}

export interface ProduitLookupItem {
  id: string;
  reference: string;
  label: string;
}
