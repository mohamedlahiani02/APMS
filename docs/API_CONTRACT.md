# APMS API contract (rewrite)

Binding contract for all backend domains and the frontend, built in parallel. If a
domain needs a shape not listed here, pick something consistent with these
conventions and note it as an assumption — don't block on it.

Base path: `/api/v1`. All responses JSON. Auth: `Authorization: Bearer <accessToken>`.

## Envelopes (already implemented, in `backend/src/common/`)

```ts
// errors.ts — every error response
{ code: string, message: string, traceId: string, details?: unknown }

// pagination.ts — every list endpoint
{ content: T[], page: { page: number, size: number, totalElements: number, totalPages: number } }
// query: ?page=0&size=20&search=foo

// lookup endpoints: GET /{resource}/lookup?q=&limit=  -> T[] (no envelope, just an array, max 50)
```

## Auth (`/auth`)

- `POST /auth/login` `{ email, password }` ->
  `{ accessToken, refreshToken, user: { id, email, firstName, lastName, role, mustChangePassword } }`
  Rate-limited 60/min/IP. 401 `AUTH_INVALID_CREDENTIALS` / `AUTH_ACCOUNT_LOCKED`.
- `POST /auth/refresh` `{ refreshToken }` -> same shape as login (rotated tokens).
- `POST /auth/logout` `{ refreshToken }` -> `204`.
- `GET /auth/me` -> `{ id, email, firstName, lastName, role, mustChangePassword }`.
- `POST /auth/change-password` `{ currentPassword, newPassword }` -> `204`. Revokes all sessions.

## Users (`/users`, ADMIN only)

- `GET /users?page&size&search` -> paged `UserDetailResponse`.
- `POST /users` `{ email, firstName, lastName, role, password }` -> `UserDetailResponse`.
- `GET/PUT/DELETE /users/{id}`.
- `POST /users/{id}/reset-password` -> `{ temporaryPassword }` (generated, `must_change_password=true`).
- `POST /users/{id}/unlock` -> `204`.

`UserDetailResponse`: `{ id, email, firstName, lastName, role, isActive, mustChangePassword, lastLoginAt, createdAt }`.

## Référentiels: `/familles`, `/fournisseurs`, `/magasins`, `/produits`

Any authenticated user (ADMIN or SECRETAIRE). Same shape per resource:

- `GET /{r}?page&size&search` -> paged list.
- `GET /{r}/lookup?q=&limit=` -> `{ id, code|reference, label }[]` (label = display name, e.g. `nom` or `designation`).
- `POST /{r}` -> create (code/reference required, immutable afterwards).
- `GET/PUT/DELETE /{r}/{id}` (PUT never accepts `code`/`reference` changes; DELETE is soft-delete).

Fields:
- `familles`: `{ id, code, nom, description, isActive }`.
- `fournisseurs`: `{ id, code, nom, adresse, telephone, email, contactPrincipal, isActive }`.
- `magasins`: `{ id, code, nom, adresse, ville, telephone, responsable, isActive }`.
- `produits`: `{ id, reference, designation, familleId, familleNom, isActive }`; list/GET accepts `?familleId=` filter.

## BL achats (`/bl-achats`)

- `GET /bl-achats?page&size&search&magasinId&fournisseurId&dateFrom&dateTo` -> paged `BlAchatResponse`.
- `GET /bl-achats/lookup?q=&limit=` -> `{ id, blNumero, label }[]`.
- `POST /bl-achats` `CreateBlAchatRequest` -> `BlAchatResponse`.
- `GET /bl-achats/{id}` -> `BlAchatResponse`.
- `PUT /bl-achats/{id}` `UpdateBlAchatRequest` -> `BlAchatResponse`. 422 `BL_ACHAT_HAS_VENTES` if `lignes` is present and any current line has been drawn from.
- `DELETE /bl-achats/{id}` -> `204`. 422 `BL_ACHAT_HAS_VENTES` if any line has been drawn from.

```ts
CreateBlAchatRequest = {
  transactionDate: string;      // ISO date, not future, not before Jan 1 of current year
  blNumero: string;
  magasinId: string;
  fournisseurId: string;
  lignes: { produitId: string; qteAchetee: number; prixAchatNetHt: number; tauxTva: 7 | 13 | 19 }[];
}
UpdateBlAchatRequest = {
  transactionDate?: string; blNumero?: string; magasinId?: string; fournisseurId?: string;
  lignes?: CreateBlAchatRequest["lignes"]; // omit entirely to leave lines untouched; providing it replaces all lines (blocked if any drawn)
}
BlAchatResponse = {
  id: string; transactionDate: string; blNumero: string;
  magasinId: string; magasinNom: string; fournisseurId: string; fournisseurNom: string;
  lignes: {
    id: string; produitId: string; produitReference: string; produitDesignation: string;
    qteAchetee: number; qteRestante: number; prixAchatNetHt: number; tauxTva: number;
    prixAchatTtc: number; prixAchatTotalTtc: number;
  }[];
}
```

## Ventes (`/ventes`)

- `GET /ventes?page&size&search&magasinId&dateFrom&dateTo` -> paged `VenteResponse`. `search` matches produit reference/designation on any line (Known Issue #19 fix).
- `POST /ventes` `CreateVenteRequest` -> `VenteResponse`.
- `GET /ventes/{id}` -> `VenteResponse`.
- `PUT /ventes/{id}` `CreateVenteRequest` -> `VenteResponse` (full replace: reverse all draws, redraw fresh).
- `DELETE /ventes/{id}` -> `204` (physical delete, draws reversed).

No per-resource export endpoint (the old `/bl-achats/export/excel` and
`/ventes/export/excel` were never called by the deployed frontend — only the
combined one below is). The ventes domain does not own any export route.

```ts
CreateVenteRequest = {
  venteDate: string; magasinId: string;
  lignes: { produitId: string; qteVendue: number; prixVenteTtc: number }[]; // user never picks a lot
}
VenteResponse = {
  id: string; venteDate: string; magasinId: string; magasinNom: string;
  lignes: {
    id: string; produitId: string; produitReference: string; produitDesignation: string;
    sourceType: "BL_LIGNE" | "STOCK_LEGACY"; qteVendue: number; prixVenteTtc: number;
    prixVenteTotalTtc: number; depassementStock: boolean; qteNonCouverte: number;
  }[];
  totalTtc: number; hasDepassement: boolean;
}
```

## Stock (`/stock`, ADMIN only)

- `GET /stock?page&size&search&magasinId` -> paged `{ produitId, produitReference, produitDesignation, magasinId, magasinNom, qteDisponible, valeur }` (computed, clamped at 0; `qte_deficit` surfaced separately if needed by a page).
- `GET /stock/legacy-lots/lookup?q=&limit=` -> `{ id, produitId, produitLabel, magasinId, qteDisponible }[]`.

## Analytics (`/analytics`, ADMIN only)

- `GET /analytics/dashboard?year&month` -> `DashboardKPIResponse`.
- `GET /analytics/annual-report?year` -> `AnnualReportResponse`.
- `GET /analytics/drilldown/{familles|fournisseurs|magasins}/{id}?year&month` -> drilldown response.

Exact numeric field names may follow the DB snapshot columns closely (e.g.
`totalAchat`, `totalVente`, `marge`, `tauxMarge`, `totalValeur`, `nbTx`,
`qteDeficit`) — the analytics agent owns the precise shape since it reflects the
underlying SQL functions; keep names self-explanatory and consistent across the
three endpoints.

## Audit (`/audit`, ADMIN only)

- `GET /audit?page&size&entityType&actorId` -> paged `{ id, entityType, entityId, action, actorEmail, actorRole, summary, changes, timestamp }`.
- `GET /audit/{entityType}/{entityId}` -> same item array, unpaged.

## Export (`/transactions/export/excel`)

Combined workbook, two tabs (BL achats, Ventes), same filters as the two list
endpoints combined (`magasinId`, `dateFrom`, `dateTo`). `.xlsx` blob.
