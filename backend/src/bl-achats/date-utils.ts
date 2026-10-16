/**
 * Parses a "YYYY-MM-DD" date-only string (format already enforced by the zod schema
 * before this runs) into two Date representations:
 *
 * - `forValidation`: a LOCAL midnight Date. `validateTransactionDate` compares dates
 *   using local `getFullYear/getMonth/getDate()`, so this is the representation that
 *   makes its comparison match the intended calendar day regardless of server TZ.
 * - `forDb`: a UTC midnight Date. Prisma serializes `@db.Date` columns using the UTC
 *   date components of the JS Date it's given — passing a local-midnight Date here
 *   would silently shift the stored day by one whenever the server's timezone offset
 *   is non-zero. This is also the representation to match against `calendar.date_full`.
 */
export function parseDateOnly(input: string): { forValidation: Date; forDb: Date } {
  const parts = input.split("-");
  const y = Number(parts[0]!);
  const m = Number(parts[1]!);
  const d = Number(parts[2]!);
  return {
    forValidation: new Date(y, m - 1, d),
    forDb: new Date(Date.UTC(y, m - 1, d)),
  };
}

/** Formats a UTC-midnight `@db.Date` value (as returned by Prisma) back to "YYYY-MM-DD". */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
