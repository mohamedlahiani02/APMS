import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpDispatcher } from "./http-dispatch.js";

describe("shared HTTP listener", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createServer(createHttpDispatcher(
      (req, res) => { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ framework: "api", url: req.url })); },
      async (req, res) => {
        if (req.url === "/failure") throw new Error("private diagnostic");
        let body = "";
        for await (const chunk of req) body += chunk.toString();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ framework: "web", url: req.url, body }));
      },
    ));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing TCP address");
    base = "http://127.0.0.1:" + address.port;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
  it.each(["/api/v1/produits?q=one", "/api/unknown", "/internal/ready"])("keeps %s in the API boundary", async (url) => {
    const result = await fetch(base + url);
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ framework: "api", url });
  });
  it("preserves the raw web POST body, including JSON", async () => {
    const body = JSON.stringify({ value: "must not be consumed by Fastify" });
    const result = await fetch(base + "/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    expect(await result.json()).toEqual({ framework: "web", url: "/dashboard", body });
  });
  it("does not confuse frontend names with the API prefix", async () => {
    const result = await fetch(base + "/apiary");
    expect(result.status).toBe(200);
    expect((await result.json() as { framework: string }).framework).toBe("web");
  });
  it("returns a generic failure without disclosing frontend exceptions", async () => {
    const result = await fetch(base + "/failure");
    expect(result.status).toBe(500);
    expect(await result.text()).toBe("Internal server error");
  });
});
