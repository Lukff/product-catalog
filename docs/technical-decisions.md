# Technical Decisions

Reference document for the Full Stack Product Catalog. It records **what** we build with, **why**, and the **contracts** both sides of the app must honor. Requirements come from `project-brief.md`; this document is the authoritative technical interpretation of them.

- Status: agreed, pre-implementation
- Date: 2026-09-19
- Scope budget: 60-90 minutes of focused effort on core end-to-end functionality

---

## 1. Stack

| Concern | Decision | Rationale |
|---|---|---|
| Language | TypeScript end-to-end (Node 20+) | One language across API and SPA; types shared instead of duplicated. |
| Backend router | Hono | Tiny, fast, standard `Request`/`Response`, first-class testability (`app.request()` needs no live port). |
| Validation | Zod | A single schema drives runtime validation, inferred TS types, and client-side form validation. |
| Database | SQLite (file-based, `better-sqlite3`) | `npm start` works with zero external services; still a real relational DB. |
| DB access | Drizzle ORM | Typed queries, migrations, and a schema file that doubles as data-model documentation. Swappable to Postgres later. |
| Frontend | Svelte 5 + Vite | Minimal boilerplate, runes cover all state needs without a state library, fast builds. |
| Styling | Tailwind CSS | Consistent, polished UI without hand-rolling a design system. |
| Tests | Vitest | One runner for unit and integration tests across workspaces. |
| CI | GitHub Actions | Single workflow; required by the brief. |

Rejected: Docker + Postgres (setup cost vs. time budget), JSON-file persistence (hand-rolled filtering/paging, less production-minded), SvelteKit (SSR surface this SPA does not need), React/Vue (no advantage once Svelte was chosen).

## 2. Repository structure

npm workspaces monorepo - one `npm install`, one source of truth for the API contract.

```
product-catalog/
  package.json            workspaces + root scripts (dev, test, lint, typecheck)
  apps/
    api/                  Hono server
      src/
        index.ts          server bootstrap
        app.ts            route registration (exported for tests)
        routes/           HTTP layer: parse, validate, serialize
        services/         business rules, timestamps, error mapping
        repositories/     Drizzle queries
        db/               schema.ts, client.ts, migrations, seed.ts
      test/
    web/                  Svelte 5 SPA
      src/
        lib/api.ts        typed fetch wrapper (unwraps `data`)
        lib/stores/       catalog query state (runes)
        components/       ProductTable, Filters, ProductForm, Pagination, MetricTiles
        views/            Dashboard, ProductDetail (modal)
      vite.config.ts      dev proxy /api -> http://localhost:3000
  packages/
    shared/               Zod schemas + inferred types, imported by api and web
  docs/
  .github/workflows/ci.yml
```

**Layering rule (API):** `routes -> services -> repositories`. Routes never touch Drizzle; repositories never throw HTTP errors. Each layer is independently testable.

**Why `packages/shared`:** the product schema, the response envelope types, and the query-parameter schema live in exactly one place. The SPA cannot drift from the API contract without a type error.

## 3. API contract

Base path `/api`. JSON only. All list and single-resource responses are wrapped.

### 3.1 Envelope

```json
{
  "data": [ { "id": 1, "title": "..." } ],
  "meta": { "page": 1, "pageSize": 30, "total": 194, "totalPages": 7 }
}
```

- Single resource: `{ "data": { ... } }` - wrapped as well, for uniformity.
- `meta` appears on collection responses only.
- `total` is the count **after** filters and **before** pagination.
- `pageSize` defaults to **30** (the brief's default limit) and is capped at 100.
- Page-based paging was chosen over offset/limit to support a numbered pager in the UI. Known trade-off: page numbers shift if rows are inserted between requests - acceptable for a single-user local catalog.

### 3.2 Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/products` | Paginated. Query: `page`, `pageSize`, `q`, `category`, `sort`. |
| GET | `/api/products/:id` | `404 NOT_FOUND` if absent. |
| POST | `/api/products` | Full body; server assigns `id` and both timestamps. `201`. |
| PATCH | `/api/products/:id` | Any subset of fields; refreshes `meta.updatedAt`. `200`. |
| DELETE | `/api/products/:id` | `204`, empty body. `404` if absent. |
| GET | `/api/categories` | Paginated list, same envelope. |
| POST | `/api/categories` | Extended endpoint; shape depends on open decision #1. |

- **Search** is `GET /api/products?q=flux`, not a separate `/search` route, so search composes with the category filter, sort, and pagination instead of duplicating that logic. Matching is a case-insensitive substring (`LIKE`) over `title` and `description`.
- **Sort** syntax: `?sort=-price` (leading `-` means descending), `?sort=stock`. Allowed fields are whitelisted: `title`, `price`, `stock`, `weight`, `createdAt`, `updatedAt`. Anything else returns `400 VALIDATION_ERROR`.
- **PATCH only** (the brief permits PUT *or* PATCH). One write path means one validation schema and no ambiguity about whether omitted fields are cleared.

### 3.3 Errors

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid product payload",
             "details": [ { "path": "price", "message": "must be >= 0" } ] } }
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod rejection of body or query params. `details` lists every failing field. |
| `NOT_FOUND` | 404 | Unknown id or unknown route. |
| `CONFLICT` | 409 | Duplicate `sku`. |
| `INTERNAL_ERROR` | 500 | Unhandled; generic message, real error logged server-side. |

A single Hono error-handling middleware maps thrown domain errors to this shape, so no route hand-writes an error response.

## 4. Data model

Product fields mirror the brief's payload exactly, so seed data loads unchanged.

| Field | Type | Rules |
|---|---|---|
| `id` | integer | `INTEGER PRIMARY KEY AUTOINCREMENT`. Seeded rows keep ids `1..N`. |
| `title` | string | required, 1-200 chars |
| `description` | string | required, up to 2000 chars |
| `category` | string (slug) | required - storage form is open decision #1 |
| `price` | number | required, `>= 0`, 2-decimal currency |
| `stock` | integer | required, `>= 0` |
| `brand` | string | required |
| `sku` | string | required, **unique** |
| `weight` | number | required, `> 0` |
| `meta.createdAt` | ISO 8601 string | server-owned |
| `meta.updatedAt` | ISO 8601 string | server-owned, refreshed on every PATCH |

**Storage vs. wire shape:** `meta` is stored as flat `created_at` / `updated_at` columns and re-nested by a serializer at the route boundary. The brief's JSON shape is preserved without a nested-object column.

**Server-owned fields:** `id` and both timestamps are ignored if a client sends them. Integer ids were kept over UUIDs because the brief's sample payload uses them and insertion order stays meaningful.

**Seeding:** `apps/api/src/db/seed.ts` loads `seed.json` (~30-40 products across several categories and brands, some with deliberately low or zero stock so filters and metrics have something to show). Run via `npm run db:seed`; idempotent, safe to re-run.

## 5. SPA design

A single dashboard view plus a detail modal - the catalog is one workflow, so navigation stays flat.

- **Metric strip** - headline counts over the catalog (exact contents depend on open decision #2).
- **Toolbar** - debounced search box, category select, sort select, page-size select.
- **Product table** - paginated rows with inline stock status; clicking a row opens the detail modal.
- **Detail modal** - full record, with Edit and Delete actions.
- **Product form** - one component for create and edit, validated client-side with the same Zod schema the API uses, so messages match.
- **Delete** - confirmation step; destructive actions are never one click.
- **State** - Svelte 5 runes (`$state`, `$derived`) in a small `catalog` store holding query params and results. Query params are mirrored into the URL so a filtered view is shareable and the back button behaves.
- **Loading, error and empty states** are explicit for the list and every mutation; API error `details` map back onto the offending form fields.

## 6. Testing and CI

**Integration tests (primary confidence):** Vitest against the real Hono app via `app.request()`, backed by a throwaway SQLite file per suite. They cover the contract the SPA depends on:

- `GET /api/products` defaults to `pageSize` 30 and returns correct `meta`
- `?q=` is case-insensitive and matches description as well as title
- `?sort=-price` orders correctly; `?sort=bogus` returns 400
- `POST` with a negative price returns `400 VALIDATION_ERROR` naming the field
- `POST` with a duplicate sku returns `409 CONFLICT`
- `PATCH` updates the field and refreshes `meta.updatedAt`
- `DELETE` returns 204, and a second delete returns 404

**Unit tests:** query-param parsing (page/pageSize/sort coercion and bounds) and the shared Zod schemas.

**CI:** `.github/workflows/ci.yml` on push and pull request - `npm ci` -> `tsc --noEmit` -> lint -> `vitest run`.

Playwright end-to-end coverage is deliberately out of scope for the initial window and is documented as a next step in `README.md`.

## 7. Open decisions

1. **Category modelling.** Options: (a) a `categories` table with `products.category_id` FK - makes create/list/filter-by-category honest and prevents typo'd categories; (b) a plain text column with `DISTINCT` for the list endpoint - least code, no validation, cannot create an empty category; (c) a registry table with no FK - flexible but allows drift. The API exposes `category` as a string slug either way, so this choice does not change the wire contract.
2. **Unprompted custom feature** (the brief requires at least one, documented with problem, persona and rationale). Candidates: low-stock alerts with inventory metrics, an audit log of mutations, bulk operations, or CSV import/export. The choice also determines the contents of the SPA metric strip.

Both must be resolved before the affected code is written. However they land, this document and `README.md` get updated with the reasoning.

## 8. Conventions

- Local dev: API on `:3000`, Vite dev server on `:5173` proxying `/api` - no CORS config needed in development.
- Root scripts: `npm run dev` (both apps), `npm test`, `npm run typecheck`, `npm run lint`, `npm run db:migrate`, `npm run db:seed`.
- Config via environment variables with sane defaults (`PORT`, database file path, and a low-stock threshold if applicable); `.env.example` committed.
- No authentication or authorization in this scope; noted as a next step.
- Commits are small, single-line, and use a Conventional Commits prefix (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`). No message body, no footers, never a `Co-Authored-By` trailer.
- `AI.md` is updated as work proceeds, not reconstructed at the end.
