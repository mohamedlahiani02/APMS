const { spawnSync } = require("node:child_process");
const path = require("node:path");
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this script through npm run setup or npm run build.");
const root = path.resolve(__dirname, "../..");
function run(dir, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [npm, ...args], {
    cwd: path.join(root, dir), stdio: "inherit",
    env: { ...process.env, ...extraEnv, NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
if (process.argv.includes("--install")) {
  run("backend", ["ci", "--include=dev"]);
  run("frontend", ["ci", "--include=dev"]);
}
run("backend", ["run", "prisma:generate"]);
run("backend", ["run", "build"]);
run("frontend", ["run", "build"], { APMS_SERVER_MODE: "unified" });
// Prune only in an explicit release build, so local development keeps its tools.
if (process.env.APMS_PRUNE_DEV === "1") {
  run("backend", ["prune", "--omit=dev"]);
  run("frontend", ["prune", "--omit=dev"]);
}
