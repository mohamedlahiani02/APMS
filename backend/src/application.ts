import { buildApp } from "./app.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerUserRoutes } from "./users/routes.js";
import { registerFamilleRoutes } from "./familles/routes.js";
import { registerFournisseurRoutes } from "./fournisseurs/routes.js";
import { registerMagasinRoutes } from "./magasins/routes.js";
import { registerProduitRoutes } from "./produits/routes.js";
import { registerBlAchatRoutes } from "./bl-achats/routes.js";
import { registerVenteRoutes } from "./ventes/routes.js";
import { registerStockRoutes } from "./stock/routes.js";
import { registerAnalyticsRoutes } from "./analytics/routes.js";
import { registerAuditRoutes } from "./audit/routes.js";
import { registerExportRoutes } from "./export/routes.js";

/** Complete application, shared by the real server and HTTP integration tests. */
export async function buildApplication() {
  const app = await buildApp();
  await app.register(registerAuthRoutes, { prefix: "/api/v1" });
  await app.register(registerUserRoutes, { prefix: "/api/v1" });
  await app.register(registerFamilleRoutes, { prefix: "/api/v1" });
  await app.register(registerFournisseurRoutes, { prefix: "/api/v1" });
  await app.register(registerMagasinRoutes, { prefix: "/api/v1" });
  await app.register(registerProduitRoutes, { prefix: "/api/v1" });
  await app.register(registerBlAchatRoutes, { prefix: "/api/v1" });
  await app.register(registerVenteRoutes, { prefix: "/api/v1" });
  await app.register(registerStockRoutes, { prefix: "/api/v1" });
  await app.register(registerAnalyticsRoutes, { prefix: "/api/v1" });
  await app.register(registerAuditRoutes, { prefix: "/api/v1" });
  await app.register(registerExportRoutes, { prefix: "/api/v1" });
  await app.ready();
  return app;
}
