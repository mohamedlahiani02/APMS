// Shapes shared by every endpoint, per docs/API_CONTRACT.md "Envelopes" section.

export interface ApiError {
  code: string;
  message: string;
  traceId: string;
  details?: unknown;
}

export interface PageMeta {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Page<T> {
  content: T[];
  page: PageMeta;
}

export interface PageQuery {
  page?: number;
  size?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  isActive?: boolean;
  familleId?: string;
  role?: "ADMIN" | "SECRETAIRE";
}

export function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" &&
    typeof v.message === "string" &&
    typeof v.traceId === "string"
  );
}

/** Extracts the backend's `message` out of an axios error, falling back to a generic string. */
export function extractApiErrorMessage(
  err: unknown,
  fallback = "Une erreur est survenue.",
): string {
  const data = (err as { response?: { data?: unknown } } | null)?.response
    ?.data;
  return isApiError(data) ? data.message : fallback;
}

/** True when the backend rejected the request with this specific error code. */
export function hasApiErrorCode(err: unknown, code: string): boolean {
  const data = (err as { response?: { data?: unknown } } | null)?.response
    ?.data;
  return isApiError(data) && data.code === code;
}
