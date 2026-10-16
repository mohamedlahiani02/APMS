import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 bytes"),
  JWT_ACCESS_TTL_MIN: z.coerce.number().int().positive().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  LOGIN_LOCKOUT_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_HOURS: z.coerce.number().int().positive().default(9),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
});

export const config = envSchema.parse(process.env);
export type Config = typeof config;
