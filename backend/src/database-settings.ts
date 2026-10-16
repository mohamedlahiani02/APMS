import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PoolConfig } from "pg";

interface DatabaseEnvironment {
  DATABASE_URL: string;
  NODE_ENV: string;
  DATABASE_TLS_MODE?: "disable" | "verify-full";
  DATABASE_CA_FILE?: string;
  DATABASE_POOL_SIZE: number;
}

/** Prisma 5 and node-postgres interpret SSL URL options differently. */
export function databaseSettings(env: DatabaseEnvironment): {
  prismaUrl: string;
  pgOptions: PoolConfig;
} {
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }
  const mode = env.DATABASE_TLS_MODE ??
    (env.NODE_ENV === "production" ||
      (url.searchParams.has("sslmode") && url.searchParams.get("sslmode") !== "disable")
      ? "verify-full" : "disable");
  const verify = mode === "verify-full";
  const caPath = env.DATABASE_CA_FILE ? resolve(env.DATABASE_CA_FILE) : undefined;
  if (caPath && !verify) throw new Error("DATABASE_CA_FILE requires verified TLS.");
  let ca: string | undefined;
  if (caPath) {
    try {
      ca = readFileSync(caPath, "utf8");
    } catch {
      throw new Error("The configured database CA certificate cannot be read.");
    }
  }
  // These deployment settings own TLS; never accept URL options that silently
  // replace node-postgres's explicit certificate verification below.
  for (const name of ["ssl", "sslmode", "sslcert", "sslrootcert", "sslkey",
    "sslidentity", "sslpassword", "sslaccept", "sslnegotiation", "uselibpqcompat"]) {
    url.searchParams.delete(name);
  }
  url.searchParams.set("connection_limit", String(env.DATABASE_POOL_SIZE));
  if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "15");
  const pgUrl = url.toString();
  url.searchParams.set("sslmode", verify ? "require" : "disable");
  if (verify) {
    url.searchParams.set("sslaccept", "strict");
    if (caPath) url.searchParams.set("sslcert", caPath);
  }
  return {
    prismaUrl: url.toString(),
    pgOptions: {
      connectionString: pgUrl,
      ssl: verify ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false,
      max: env.DATABASE_POOL_SIZE,
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 30_000,
    },
  };
}
