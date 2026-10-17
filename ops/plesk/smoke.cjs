const assert = require("node:assert/strict");
const { createServer } = require("node:net");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const realDb = process.argv.includes("--configured-db");

(async () => {
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const childEnvironment = {
      ...process.env,
      ...(realDb ? {} : { DATABASE_URL: "postgresql://unused:unused@127.0.0.1:9/apms", DATABASE_TLS_MODE: "disable" }),
      NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port), CORS_ORIGINS: "", TRUST_PROXY: "",
      JWT_SECRET: crypto.randomBytes(48).toString("base64url"), NEXT_TELEMETRY_DISABLED: "1",
  };
  if (!realDb) delete childEnvironment.DATABASE_CA_FILE;
  const child = spawn(process.execPath, [path.join(root, "app.js")], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"], env: childEnvironment,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  const base = "http://127.0.0.1:" + port;
  try {
    const deadline = Date.now() + 45_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error("Unified startup process exited before readiness");
      try { ready = (await fetch(base + "/internal/health", { signal: AbortSignal.timeout(1500) })).ok; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert(ready, "Unified listener did not become ready");
    const login = await fetch(base + "/login");
    assert.equal(login.status, 200);
    const html = await login.text();
    assert.match(html, /APMS/);
    const asset = html.match(/src="(\/_next\/static\/[^" ]+\.js(?:\?[^" ]*)?)"/);
    assert(asset, "Login page must reference a built Next.js asset");
    const js = await fetch(base + asset[1]);
    assert.equal(js.status, 200);
    assert((await js.text()).length > 100);
    assert.match(html, /rel="manifest"/);
    const manifestResponse = await fetch(base + "/manifest.webmanifest");
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.display, "standalone");
    for (const size of [192, 512]) {
      const icon = manifest.icons.find((item) => item.sizes === size + "x" + size);
      assert(icon, "Missing install icon: " + size);
      const response = await fetch(base + icon.src);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(bytes.readUInt32BE(16), size);
      assert.equal(bytes.readUInt32BE(20), size);
    }
    const protectedApi = await fetch(base + "/api/v1/produits", { headers: { Origin: "https://untrusted.example.invalid" } });
    assert.equal(protectedApi.status, 401);
    assert.equal(protectedApi.headers.get("access-control-allow-origin"), null);
    assert.match(protectedApi.headers.get("content-type"), /application\/json/);
    const missingApi = await fetch(base + "/api/v1/not-a-route");
    assert.equal(missingApi.status, 404);
    assert.match(missingApi.headers.get("content-type"), /application\/json/);
    if (realDb) {
      const database = await fetch(base + "/internal/ready");
      assert.equal(database.status, 200);
      assert.deepEqual(await database.json(), { status: "UP", db: "UP" });
    }
    console.log(JSON.stringify({ unifiedListener: true, loginHtml: true, nextAsset: true, apiRequiresAuthentication: true, unknownApiStaysJson: true, untrustedCorsOriginDenied: true, databaseChecked: realDb }));
  } catch (error) {
    // Startup messages contain no connection URLs or credentials. Keep details
    // bounded instead of dumping the inherited environment.
    console.error(error.message);
    console.error(output.slice(-2000).replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[redacted connection URL]"));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    const result = await Promise.race([exited, new Promise((resolve) => { const timer = setTimeout(() => resolve(null), 15_000); timer.unref(); })]);
    if (!result) { child.kill("SIGKILL"); process.exitCode = 1; console.error("Unified server did not shut down within the smoke-test deadline"); }
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
