# APMS

French-language auto-parts purchases, sales, stock and analytics for a Tunisian SME. Fastify + TypeScript + Prisma/PostgreSQL 15 backend and a Next.js web frontend. This rewrite reuses the production database schema and reporting functions; users open a browser, with no Electron installer.

## Start locally

1. From ops run docker compose up -d.
2. Restore the handover database into the empty local development database. Keep the sensitive dump outside this repository.
3. In backend run npm ci, configure .env from .env.example, then npm run prisma:generate. Baseline/migration instructions are in docs/RUNBOOK.md.
4. Run npm run dev in backend, then npm ci and npm run dev in frontend.
5. Open http://127.0.0.1:3000. Browser API requests use the web origin; Next.js forwards them to the backend on port 3001.

## Verify

Run ./scripts/verify.ps1 from PowerShell. The backend suites use the restored local database on loopback port 5433. The checks include complete HTTP workflows, role restrictions, stock draw/reverse/redraw and concurrent requests. Build outputs and secrets are ignored by Git.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Business rules](docs/BUSINESS_RULES.md)
- [API contract](docs/API_CONTRACT.md)
- [Runbook](docs/RUNBOOK.md)
- [Known constraints](docs/KNOWN_ISSUES.md)
- [Verification record](docs/VERIFICATION.md)

Server deployment and production cutover are outside the offline rewrite scope.
