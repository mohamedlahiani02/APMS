/** Test-only helpers shared by the bl-achats spec. */

/** Thrown at the end of every mutating test to roll back `prisma.$transaction` — never a real failure. */
export class RollbackForTest extends Error {
  constructor() {
    super("RollbackForTest: intentional, swallow this and only this in tests.");
  }
}

/** Runs `fn`, swallowing ONLY RollbackForTest; any other thrown error still fails the test. */
export async function runAndRollback(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof RollbackForTest) return;
    throw err;
  }
}
