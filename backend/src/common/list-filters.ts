import { z } from "zod";
import type { PageQuery } from "./pagination.js";
export const booleanQuery = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();
export function listOrder(
  query: Pick<PageQuery, "sortBy" | "sortDirection">,
  fields: Record<string, string>,
  fallback: string,
  direction: "asc" | "desc" = "asc",
) {
  const field =
    query.sortBy && Object.hasOwn(fields, query.sortBy)
      ? fields[query.sortBy]!
      : fallback;
  return [
    { [field]: query.sortDirection ?? direction },
    { id: "asc" as const },
  ];
}
