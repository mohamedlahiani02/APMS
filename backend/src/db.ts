import { PrismaClient, Prisma } from "@prisma/client";
import pg from "pg";
import { config } from "./config.js";

export const prisma = new PrismaClient({
  log: config.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

/**
 * Raw connection pool for logic that is native SQL by design: the vente
 * draw/reverse transaction, BL line replace-on-update, and the analytics
 * stored functions/procedures. Mirrors the Java backend's split between JPA
 * (simple CRUD) and native queries (everything transactional or DB-resident).
 */
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export async function closeDb(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}

/** NUMERIC(12,3) HALF_UP rounding, matching every money/quantity CHECK constraint in the schema. */
export function round3(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

export { Prisma };
