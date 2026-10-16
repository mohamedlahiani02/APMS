import { defineConfig } from "vitest/config";

// Transport and dispatcher tests never access a database or need credentials.
export default defineConfig({ test: { include: ["src/database-settings.test.ts", "src/http-dispatch.test.ts"] } });
