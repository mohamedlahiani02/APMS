import { z } from "zod";
import { pageQuerySchema } from "../common/pagination.js";

/** List query: page/size/search (search = code + nom, case-insensitive contains). */
export const magasinListQuerySchema = pageQuerySchema;
export type MagasinListQuery = z.infer<typeof magasinListQuerySchema>;

/** `code` is required and immutable afterwards — never part of the update schema. */
export const createMagasinSchema = z.object({
  code: z.string().trim().min(1).max(20),
  nom: z.string().trim().min(1).max(200),
  adresse: z.string().trim().optional(),
  ville: z.string().trim().max(100).optional(),
  telephone: z.string().trim().max(30).optional(),
  responsable: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional(),
});
export type CreateMagasinRequest = z.infer<typeof createMagasinSchema>;

/** Update schema intentionally omits `code` entirely: it is immutable after creation. */
export const updateMagasinSchema = z.object({
  nom: z.string().trim().min(1).max(200).optional(),
  adresse: z.string().trim().nullable().optional(),
  ville: z.string().trim().max(100).nullable().optional(),
  telephone: z.string().trim().max(30).nullable().optional(),
  responsable: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMagasinRequest = z.infer<typeof updateMagasinSchema>;

export interface MagasinResponse {
  id: string;
  code: string;
  nom: string;
  adresse: string | null;
  ville: string | null;
  telephone: string | null;
  responsable: string | null;
  isActive: boolean;
}

export interface MagasinLookupItem {
  id: string;
  code: string;
  label: string;
}
