import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  DATABASE_TLS_MODE: z.enum(["disable", "verify-full"]).optional(),
  DATABASE_CA_FILE: z.string().min(1).optional(),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(30).default(3),
  CORS_ORIGINS: z.string().default(""),
  TRUST_PROXY: z.string().default(""),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 bytes"),
  JWT_ACCESS_TTL_MIN: z.coerce.number().int().positive().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  LOGIN_LOCKOUT_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_HOURS: z.coerce.number().int().positive().default(9),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
});

export const config = envSchema.parse(process.env);
export type Config = typeof config;
