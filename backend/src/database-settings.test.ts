import { describe, expect, it } from "vitest";
import pg from "pg";
import { databaseSettings } from "./database-settings.js";

const base = { DATABASE_URL: "postgresql://test:dummy@db.example.invalid:5432/postgres?schema=public", NODE_ENV: "production", DATABASE_POOL_SIZE: 3 };
describe("database transport configuration", () => {
  it("requires verified TLS for both production drivers", () => {
    const settings = databaseSettings(base);
    const url = new URL(settings.prismaUrl);
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("sslaccept")).toBe("strict");
    // Exercise pg's real URL parser: URL SSL fields can otherwise overwrite
    // rejectUnauthorized even when the caller explicitly supplied it.
    const client = new pg.Client(settings.pgOptions);
    expect(client.ssl).toEqual({ rejectUnauthorized: true });
  });
  it.each(["sslmode=no-verify", "sslmode=disable&uselibpqcompat=true", "ssl=true&sslaccept=accept_invalid_certs"])("prevents a URL downgrade: %s", (query) => {
    const settings = databaseSettings({ ...base, DATABASE_URL: base.DATABASE_URL + "&" + query });
    const client = new pg.Client(settings.pgOptions);
    expect(client.ssl).toEqual({ rejectUnauthorized: true });
    expect(new URL(settings.prismaUrl).searchParams.get("sslaccept")).toBe("strict");
  });
  it("keeps the explicitly configured local preview usable without TLS", () => {
    const settings = databaseSettings({ ...base, DATABASE_TLS_MODE: "disable" });
    expect(new pg.Client(settings.pgOptions).ssl).toBe(false);
    expect(new URL(settings.prismaUrl).searchParams.get("sslmode")).toBe("disable");
  });
  it("bounds each pool independently", () => {
    const settings = databaseSettings({ ...base, DATABASE_POOL_SIZE: 2 });
    expect(settings.pgOptions.max).toBe(2);
    expect(new URL(settings.prismaUrl).searchParams.get("connection_limit")).toBe("2");
  });
  it("does not include a malformed connection URL or unreadable CA path in errors", () => {
    expect(() => databaseSettings({ ...base, DATABASE_URL: "not a URL containing a secret" })).toThrow("DATABASE_URL must be a valid PostgreSQL connection URL.");
    expect(() => databaseSettings({ ...base, DATABASE_CA_FILE: "/nonexistent-apms-private-ca.pem" })).toThrow("The configured database CA certificate cannot be read.");
  });
});
