# APMS rewrite architecture

APMS is a French-language auto-parts purchasing, sales, stock and reporting web application. The rewrite is a monorepo: Fastify/TypeScript and Prisma in backend, Next.js/React in frontend, PostgreSQL 15 in a local Docker container. There is no Electron dependency.

## Request and data flow

The browser calls /api/v1 on the web origin. Next.js forwards that path to BACKEND_ORIGIN (default http://127.0.0.1:3001); set it before building. Access tokens are attached by the Axios interceptor. Concurrent expired-token requests share one refresh request. Zustand persists the session in localStorage. TanStack Query owns server data and is cleared at logout.

backend/src/application.ts assembles all twelve domains and is shared by the server and HTTP tests. backend/src/app.ts provides infrastructure for isolated route tests. The API binds to HOST (127.0.0.1 by default), PORT 3001. /internal/health is liveness; /internal/ready checks PostgreSQL and returns 503 when unavailable. Error bodies include code, message and traceId; X-Trace-Id is echoed on responses.

Prisma handles CRUD and transactions. Parameterized pg queries call the original PostgreSQL analytics routines and compute current stock. Analytics snapshots are invalidated by database triggers. The migration 1_database_logic restores routines, CHECK constraints, partial indexes and triggers omitted by Prisma introspection, using the handover schema. The already-applied 0_baseline migration is preserved.

## Access

Both roles can edit référentiels and purchases/sales and download the combined workbook. ADMIN additionally sees stock, analytics, users and audit. API authorization rechecks account activity and current role, and requires first-login password changes before business access. The frontend gates administrator routes before mounting their pages.

Passwords use bcrypt cost 12. Access JWTs expire after 15 minutes; refresh sessions after seven days, configurable in backend/src/config.ts. Refresh rotation is atomic and single-use. Lockout follows five failures for nine hours; login is limited to 60 requests per minute per IP. Password changes revoke refresh sessions and require a fresh browser login. Existing access JWTs otherwise expire naturally; account disable/delete takes effect on the next authenticated request.

## Concurrency and auditing

All BL and vente mutations acquire a transaction-scoped PostgreSQL advisory lock before reading balances. This serializes short stock mutations across backend processes, preventing lost balances, conflicting redraws and races with BL replacement/deletion. It favors correctness for this single-business installation over parallel stock writes; revisit granularity if write throughput warrants it.

Business audit rows commit or roll back with the mutation. Authentication events use independent writes, so failed logins remain auditable. No production service or database is part of local verification.

## UI routes

Public: /login. Authenticated: /change-password, /transactions, /produits, /familles, /fournisseurs, /magasins. Administrator: /dashboard, /bilan, /stock, /utilisateurs, /audit. / sends each role to its landing page through AuthGate.
