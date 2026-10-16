import type { Prisma } from "@prisma/client";
export async function lockStockLedger(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(1095781715, 1) IS NULL AS locked`;
}
