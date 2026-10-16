import { z } from "zod";
import { pageQuerySchema } from "../common/pagination.js";

/** List query: page/size/search (search = code + nom, case-insensitive contains). */
export const fournisseurListQuerySchema = pageQuerySchema;
export type FournisseurListQuery = z.infer<typeof fournisseurListQuerySchema>;

/** `code` is required and immutable afterwards — never part of the update schema. */
export const createFournisseurSchema = z.object({
  code: z.string().trim().min(1).max(20),
  nom: z.string().trim().min(1).max(200),
  adresse: z.string().trim().optional(),
  telephone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(255).optional(),
  contactPrincipal: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional(),
});
export type CreateFournisseurRequest = z.infer<typeof createFournisseurSchema>;

/** Update schema intentionally omits `code` entirely: it is immutable after creation. */
export const updateFournisseurSchema = z.object({
  nom: z.string().trim().min(1).max(200).optional(),
  adresse: z.string().trim().nullable().optional(),
  telephone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  contactPrincipal: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateFournisseurRequest = z.infer<typeof updateFournisseurSchema>;

export interface FournisseurResponse {
  id: string;
  code: string;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  contactPrincipal: string | null;
  isActive: boolean;
}

export interface FournisseurLookupItem {
  id: string;
  code: string;
  label: string;
}
