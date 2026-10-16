import { z } from "zod";
import { pageQuerySchema } from "../common/pagination.js";

/** List query: page/size/search (search = code + nom, case-insensitive contains). */
export const familleListQuerySchema = pageQuerySchema;
export type FamilleListQuery = z.infer<typeof familleListQuerySchema>;

/** `code` is required and immutable afterwards — never part of the update schema. */
export const createFamilleSchema = z.object({
  code: z.string().trim().min(1).max(10),
  nom: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
});
export type CreateFamilleRequest = z.infer<typeof createFamilleSchema>;

/** Update schema intentionally omits `code` entirely: it is immutable after creation. */
export const updateFamilleSchema = z.object({
  nom: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateFamilleRequest = z.infer<typeof updateFamilleSchema>;

export interface FamilleResponse {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  isActive: boolean;
}

export interface FamilleLookupItem {
  id: string;
  code: string;
  label: string;
}
