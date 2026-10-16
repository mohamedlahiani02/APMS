const os = require("node:os");
const net = require("node:net");
const report = process.report.getReport().header;
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, openssl: process.versions.openssl, glibc: report.glibcVersionRuntime || null, systemMemoryMb: Math.round(os.totalmem() / 1024 / 1024) }));
let host = process.env.APMS_DB_CHECK_HOST;
if (!host && process.env.DATABASE_URL) {
  try { host = new URL(process.env.DATABASE_URL).hostname; }
  catch { console.error("Invalid database URL; value withheld"); process.exit(1); }
}
if (!host) { console.log("Database TCP check skipped: configure DATABASE_URL or APMS_DB_CHECK_HOST first."); process.exit(0); }
const socket = net.connect({ host, port: 5432 });
socket.setTimeout(10_000);
socket.once("connect", () => { console.log("Supabase TCP OK"); socket.end(); });
socket.once("timeout", () => { console.error("Database TCP timeout"); socket.destroy(); process.exitCode = 1; });
socket.once("error", (error) => { console.error("Database TCP error: " + error.code); process.exitCode = 1; });
