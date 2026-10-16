import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// These suites exercise restored data and bcrypt cost 12. Limit contention and
// allow real cryptographic work to finish before fixture cleanup begins.
const database = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || database.port !== '5433') {
  throw new Error('Integration tests require the local development database on port 5433.');
}
export default defineConfig({
  test: { fileParallelism: false, testTimeout: 30_000, hookTimeout: 30_000 },
});
