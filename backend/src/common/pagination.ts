import { z } from "zod";

/** `page`/`size` query params, matching the old API: 0-based page, default size 20, max 200. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().min(1).optional(),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface PageMetadata {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface PagedResponse<T> {
  content: T[];
  page: PageMetadata;
}

export function toPagedResponse<T>(content: T[], totalElements: number, query: PageQuery): PagedResponse<T> {
  return {
    content,
    page: {
      page: query.page,
      size: query.size,
      totalElements,
      totalPages: Math.ceil(totalElements / query.size),
    },
  };
}

/** `/lookup?q=&limit=` query params used by every searchable picker. */
export const lookupQuerySchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type LookupQuery = z.infer<typeof lookupQuerySchema>;
