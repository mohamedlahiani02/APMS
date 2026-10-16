const path = require("node:path");
const fs = require("node:fs");
const { createServer } = require("node:http");
const { pathToFileURL } = require("node:url");

async function start() {
  const root = path.resolve(__dirname, "../..");
  process.chdir(root);
  let stage = "configuration";
  let api, web, closeDb;
  try {
    require(path.join(root, "backend/node_modules/dotenv")).config({ path: path.join(root, ".env") });
    process.env.NODE_ENV = "production";
    process.env.APMS_SERVER_MODE = "unified";
    process.env.NEXT_TELEMETRY_DISABLED = "1";
    process.env.PORT ||= "3000";
    const port = Number(process.env.PORT);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("Invalid application port");
    const built = JSON.parse(fs.readFileSync(path.join(root, "frontend/.next/required-server-files.json"), "utf8"));
    if (built.config.output === "standalone") throw new Error("Build the unified frontend with npm run build");
    const backend = (name) => import(pathToFileURL(path.join(root, "backend/dist/" + name + ".js")).href);
    const [{ buildApplication }, { createHttpDispatcher }, db] = await Promise.all([backend("application"), backend("http-dispatch"), backend("db")]);
    closeDb = db.closeDb;
    let handleWeb;
    api = await buildApplication({ serverFactory(handler) {
      const server = createServer(createHttpDispatcher(handler, (req, res) => handleWeb(req, res), () => api.log.error({ code: "FRONTEND_REQUEST_FAILED" }, "Frontend request failed")));
      server.requestTimeout = 120_000;
      server.headersTimeout = 65_000;
      server.keepAliveTimeout = 5_000;
      return server;
    } });
    stage = "frontend";
    const next = require(path.join(root, "frontend/node_modules/next"));
    web = next({ dev: false, dir: path.join(root, "frontend"), conf: built.config, httpServer: api.server, port });
    handleWeb = web.getRequestHandler();
    await web.prepare();
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 30_000);
      deadline.unref();
      try { await api.close(); await web.close(); await closeDb(); }
      finally { clearTimeout(deadline); }
    };
    process.once("SIGTERM", () => void stop());
    process.once("SIGINT", () => void stop());
    stage = "listen";
    await api.listen({ port, host: process.env.HOST || "127.0.0.1" });
    console.log(JSON.stringify({ service: "apms", status: "ready", version: require(path.join(root, "package.json")).version }));
    return { api, web, stop };
  } catch (error) {
    console.error(JSON.stringify({ service: "apms", status: "startup_failed", stage, code: error.code || error.name || "STARTUP_ERROR" }));
    await Promise.allSettled([api?.close(), web?.close(), closeDb?.()]);
    process.exitCode = 1;
    return null;
  }
}
module.exports = { start };
