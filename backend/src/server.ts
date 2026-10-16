import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeDb } from "./db.js";

// Domain route plugins are registered here, one per domain, as they land:
// import { registerAuthRoutes } from "./auth/routes.js";
// import { registerUserRoutes } from "./users/routes.js";
// import { registerFamilleRoutes } from "./familles/routes.js";
// import { registerFournisseurRoutes } from "./fournisseurs/routes.js";
// import { registerMagasinRoutes } from "./magasins/routes.js";
// import { registerProduitRoutes } from "./produits/routes.js";
// import { registerBlAchatRoutes } from "./bl-achats/routes.js";
// import { registerVenteRoutes } from "./ventes/routes.js";
// import { registerStockRoutes } from "./stock/routes.js";
// import { registerAnalyticsRoutes } from "./analytics/routes.js";
// import { registerAuditRoutes } from "./audit/routes.js";
// import { registerExportRoutes } from "./export/routes.js";

async function main() {
  const app = await buildApp();

  // app.register(registerAuthRoutes, { prefix: "/api/v1" });
  // app.register(registerUserRoutes, { prefix: "/api/v1" });
  // app.register(registerFamilleRoutes, { prefix: "/api/v1" });
  // app.register(registerFournisseurRoutes, { prefix: "/api/v1" });
  // app.register(registerMagasinRoutes, { prefix: "/api/v1" });
  // app.register(registerProduitRoutes, { prefix: "/api/v1" });
  // app.register(registerBlAchatRoutes, { prefix: "/api/v1" });
  // app.register(registerVenteRoutes, { prefix: "/api/v1" });
  // app.register(registerStockRoutes, { prefix: "/api/v1" });
  // app.register(registerAnalyticsRoutes, { prefix: "/api/v1" });
  // app.register(registerAuditRoutes, { prefix: "/api/v1" });
  // app.register(registerExportRoutes, { prefix: "/api/v1" });

  const shutdown = async () => {
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
