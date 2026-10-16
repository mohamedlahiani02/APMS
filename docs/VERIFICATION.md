# Verification — 2026-10-16

Work was performed only in the new TypeScript APMS repository. The Java/Spring Boot handover was read as reference; the production server was not accessed.

## Confirmed

- Backend TypeScript checking and production compilation pass.
- All 91 tests in 13 Vitest suites pass against the local restored PostgreSQL 15 database on port 5433. HTTP coverage assembles the same application as the real server and checks all twelve domains, both roles, CRUD, stock draw/reverse/redraw, oversell, BL guards, sales search, audit, Excel export, first-login password changes and concurrent sale/refresh requests.
- Frontend lint and Next.js production build pass. Ten isolated frontend interaction tests in four Vitest suites also pass. All application routes are generated, including stock and audit.
- Both Prisma migrations were deployed into a newly created scratch database. It contained all five original stored routines, two triggers and 40 CHECK constraints; get_kpi_lines_for_month executed successfully. Only that scratch database was removed. The supplemental migration also deployed successfully against the local restored database.
- The original applied baseline was not edited. Production business rows were not reset or migrated.

## Outstanding manual verification

The browser permission gate declined access to http://127.0.0.1:3100. Therefore no visual screenshot review or browser walkthrough is claimed. Verify every route and modal as both roles, searchable filters and line pickers, login/logout, downloads and responsive layout before calling the rewrite fully accepted. HTTP tests and successful builds do not substitute for this.

The legacy visual-style repository and the live production UI were not inspected in this session; exact client-approved visual parity remains unverified.

## Publication and deployment

The user authorized GitHub publication. The pre-UX baseline was pushed to main at 3b52d6f and its GitHub Actions checks succeeded. The approved UI improvements are developed on codex/ui-ux-improvements. Sensitive handover data and local credentials remain excluded. Server cutover remains outside the rewrite scope.

## Container preview follow-up

The full TypeScript stack was built and started in Docker on 2026-10-16. apms-rewrite-frontend, apms-rewrite-backend and apms-rewrite-postgres reported healthy on loopback ports 3100, 3101 and 5433. The login page, API database readiness, separate local demo administrator login, products, stock, sales, dashboard and combined Excel export all passed through the web container's API proxy. The legacy Java containers were left running unchanged. Demo credentials are stored only in the ignored backend/.env.local file and excluded from image contexts. Embedded browser access remains blocked by a saved permission setting; visual acceptance is still pending.

## Approved UI improvements

See UI_UX.md and the API contract extension for scope and remaining visual acceptance. Backend HTTP regression tests confirm combined filters, identical filtered Excel results, ordered/valid date ranges and scoped KPI comparisons/drilldown. Frontend interaction tests exercise table pagination/sorting, calendar presets, keyboard/pointer selectors and guarded form closure, including line buttons and read-only pagination. The test runner emits a React act scheduling warning in one passing modal test; no visual browser verification is implied.

The updated UI/API Docker images also compiled successfully and all three rewrite containers became healthy. Post-rebuild HTTP smoke checks passed through the frontend proxy for login, readiness, references, users, stock, purchases, sales, audit, KPI scope/comparison, invalid date ranges, filtered single-sheet Excel and full two-sheet Excel. Only smoke-test sessions were logged out; the demo administrator remains available.
