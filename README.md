# APMS

Auto-parts purchases/sales/stock/analytics management for a Tunisian SME
("SIA-APMS"). Full rewrite of the original Spring Boot + Next.js/Electron
system: Node.js/TypeScript backend (Fastify + Prisma, reusing the existing
PostgreSQL schema) and a fresh Next.js web frontend (no Electron shell).

See `C:\Users\haith\.claude\plans\clever-orbiting-jellyfish.md` (or the project
memory) for the full rewrite plan and the business logic being preserved.

## Local development

```powershell
cd ops; docker compose up -d        # PostgreSQL 15 on 127.0.0.1:5433
cd ../backend
npm install
cp .env.example .env                # fill in DATABASE_URL / JWT_SECRET
npm run prisma:generate
npm run dev                         # http://127.0.0.1:3001
```

Restore a copy of a production dump into the local database with
`pg_restore` (inside the `apms-rewrite-postgres` container, since no local
libpq client is assumed):

```powershell
docker cp path\to\dump.dump apms-rewrite-postgres:/tmp/apms.dump
docker exec apms-rewrite-postgres pg_restore -U apms_user -d apms --no-owner --role=apms_user -v /tmp/apms.dump
```
