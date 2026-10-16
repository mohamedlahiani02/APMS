import { buildApplication } from './application.js';
import { config } from './config.js';
import { closeDb } from './db.js';

async function main() {
  const app = await buildApplication();
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    await closeDb();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exitCode = 1;
});
