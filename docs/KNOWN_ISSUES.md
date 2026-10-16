# Rewrite status and remaining constraints

This file describes the rewrite, not unresolved Windows-server issues from the old deployment.

- Server cutover, NSSM setup, production backup/restore rehearsal, firewall/reverse-proxy/TLS configuration and production-account migration are outside the offline rewrite scope. The existing live server was not accessed.
- Historical duplicate product reference 01381 remains in the restored dataset. Resolve with the business owner before imposing a global unique constraint.
- Current-stock lot-cost valuation and monthly snapshot CMUP valuation intentionally differ. Annual rankings are end-period monthly rankings, not annual cumulative rankings.
- Access tokens expire naturally within 15 minutes after logout/password reset; refresh sessions are revoked immediately. Disabled/deleted accounts are rejected on subsequent requests. Browser tokens are currently stored in localStorage; an HTTP-only cookie design would be a separate authentication change.
- The schema baseline originally omitted PostgreSQL routines, CHECK constraints, triggers and partial indexes. Migration 1_database_logic supplies these without changing the applied baseline.
- The frontend/backend builds and tests are recorded in VERIFICATION.md. Do not interpret successful type-checks or per-domain tests as proof that the full assembled application works.
