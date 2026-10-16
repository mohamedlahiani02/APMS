# Local development and verification

This runbook covers the offline rewrite. Production deployment/cutover is a separate operation. Use a supported Node.js version compatible with the checked-in Next.js version, npm, Docker Desktop and Git. Install from the lockfiles with npm ci in each application.

## Database

From ops run docker compose up -d. PostgreSQL is exposed only at 127.0.0.1:5433 in container apms-rewrite-postgres. The compose password is for this local container only. Do not use production service scripts or port 5432.

For a new development volume, restore the handover dump into the empty apms database with pg_restore --no-owner --role=apms_user. The dump contains real business data: keep it outside this repository. Do not use --clean against an existing development database. Copy backend/.env.example to backend/.env and set DATABASE_URL for that local container and a fresh random JWT_SECRET with at least 32 characters. Never commit .env.

For an existing restored schema without Prisma metadata, run npx prisma migrate resolve --applied 0_baseline from backend once. Then run npm run prisma:deploy and npm run prisma:generate. If 0_baseline is already recorded, proceed directly to deploy/generate. The supplemental migration installs original routines, checks and triggers idempotently. Never edit either migration after it has been applied.

An empty schema can be created with prisma migrate deploy, but it contains no business data, calendar rows or accounts. Use a restored local dump for the integration suites and comparison with historical reports. db/production-schema.sql is data-free reference material.

## Local administrator

To add a fresh local administrator without changing restored accounts, set APMS_ADMIN_EMAIL and APMS_ADMIN_PASSWORD in the terminal environment, then run npm run admin:create in backend. The command only accepts loopback port 5433, refuses existing email addresses and requires a password change at first login. Clear those environment variables afterward; never put them in source control. Existing administrators can also manage users through /utilisateurs.

## Run

In backend run npm run dev. In frontend run npm run dev and open http://127.0.0.1:3000. The frontend defaults to proxying /api/v1 to http://127.0.0.1:3001. For another backend port set BACKEND_ORIGIN before frontend build/start. To expose the web UI on a local network, configure the frontend host and keep the backend on loopback.

Backend liveness: /internal/health. Database readiness: /internal/ready. Use the response's X-Trace-Id to find related errors. Database connection values and JWT secrets must not appear in logs or commits.

## Check and build

From the repository root, scripts/verify.ps1 runs backend type-checks, every Vitest suite, frontend lint and the production builds. Tests deliberately refuse any database except a loopback address on port 5433. Tests create uniquely identified fixtures and remove them or roll back their transactions; do not interrupt a mutating suite unnecessarily. bcrypt tests have a 30-second timeout and suites run serially to avoid CPU contention.

For manual checks, use temporary local test accounts. Walk each route as ADMIN and SECRETAIRE, validate searchable product/store/supplier pickers, edit purchases before/after a draw, edit and delete sales, verify oversell warnings, download Excel with/without filters, inspect audit history and compare dashboard figures with SQL snapshots. Remove local browser fixtures when done. Never change restored business-account passwords just for testing.

Build backend with npm run build and run npm start. Build frontend with npm run build and run npm start. Next.js also emits .next/standalone for a future deployment package; copy static/public assets when preparing that package. The browser must never be configured to call its own 127.0.0.1 API on a remote machine.

## Git and GitHub

Use topic branches under codex/ and keep generated output, .env, dumps and raw session transcripts out of Git. The origin is https://github.com/mohamedlahiani02/APMS.git. Verify repository visibility before the first publication. Keep local commits reviewable; publish/cut over only within the agreed scope.
