# Technical Decisions

Reference document for the Full Stack Product Catalog. It records **what** we build with, **why**, and the **contracts** both sides of the app must honor. Requirements come from `project-brief.md`; this document is the authoritative technical interpretation of them.

- Status: agreed, pre-implementation
- Date: 2026-09-19
- Scope budget: 60-90 minutes of focused effort on core end-to-end functionality

---

## 1. Stack

| Concern | Decision | Rationale |
|---|---|---|
| Language | TypeScript end-to-end (Node 20.12+), pinned to 6.0.x | One language across API and SPA; types shared instead of duplicated. Held below 7 because `typescript-eslint` 8.x supports `<6.1.0` only; revisit when it ships TS 7 support. |
| Package manager | pnpm (workspaces) | Strict, symlinked `node_modules` prevents phantom dependencies between workspaces; fast, disk-efficient installs; first-class workspace support. Pinned via the `packageManager` field so Corepack gives every developer and CI the same version. |
| Lint / format | ESLint (flat config, `typescript-eslint`) + Prettier | Standard, widely understood toolchain; `eslint-plugin-svelte` and `prettier-plugin-svelte` slot in when the web app is scaffolded. |
| Backend router | Hono | Tiny, fast, standard `Request`/`Response`, first-class testability (`app.request()` needs no live port). |
| Validation | Zod | A single schema drives runtime validation, inferred TS types, and client-side form validation. |
| Database | SQLite (file-based, `better-sqlite3` pinned to 12.x) | `pnpm start` works with zero external services; still a real relational DB. Held on 12.x because 13 dropped prebuilt binaries and compiles from source, which needs a C++ toolchain (Visual Studio) on Windows; 12.x downloads a prebuilt binary and installs with no compiler. pnpm only runs its install script because `better-sqlite3` is allow-listed in `pnpm-workspace.yaml`. |
| DB access | Drizzle ORM | Typed queries, migrations, and a schema file that doubles as data-model documentation. Swappable to Postgres later. |
| Frontend | Svelte 5 + Vite | Minimal boilerplate, runes cover all state needs without a state library, fast builds. |
| Styling | Tailwind CSS | Consistent, polished UI without hand-rolling a design system. |
| Tests | Vitest | One runner for unit and integration tests across workspaces. |
| CI | GitHub Actions | Single workflow; required by the brief. |
| Dependency audit | `pnpm audit`, in CI and a Husky pre-commit hook | Known-vulnerable dependencies are caught before they reach the repo and again on every push. Husky installs the hook through the root `prepare` script, so `pnpm install` is the only setup step. |

Rejected: Docker + Postgres (setup cost vs. time budget), JSON-file persistence (hand-rolled filtering/paging, less production-minded), SvelteKit (SSR surface this SPA does not need), React/Vue (no advantage once Svelte was chosen), npm workspaces (hoisted `node_modules` lets a workspace import a package it never declared; pnpm makes that a hard error).

## 2. Repository structure

pnpm workspaces monorepo (`pnpm-workspace.yaml`) - one `pnpm install`, one source of truth for the API contract. Workspace packages are named `@catalog/api`, `@catalog/web` and `@catalog/shared`, and depend on each other with the `workspace:*` protocol.

```
product-catalog/
  package.json            root scripts (dev, test, lint, typecheck) + packageManager pin
  pnpm-workspace.yaml     workspace globs
  .gitattributes          LF line endings on every OS (Prettier expects LF)
  apps/
    api/                  Hono server
      src/
        index.ts          server bootstrap (binds the port, nothing else)
        app.ts            createApp({ db }) factory: routes + error handling (exported for tests)
        config.ts         PORT, DATABASE_PATH
        env.ts            loads apps/api/.env into process.env; never overrides real variables
        errors.ts         AppError, ValidationError, NotFoundError, ConflictError
        middleware/       error-handler.ts: the one place error responses are written
        routes/           HTTP layer: parse, validate, serialize
        services/         business rules, timestamps, error mapping
        repositories/     Drizzle queries
        db/               schema.ts, client.ts, migrate.ts, migrations/, seed.ts, seed.json
      drizzle.config.ts   drizzle-kit: generates SQL migrations from schema.ts
      .env.example        PORT and DATABASE_PATH defaults; copy to .env
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

**Layering rule (API):** `routes -> services -> repositories`. Routes never touch Drizzle; repositories never throw HTTP errors. Each layer is independently testable. The rule is enforced by ESLint `no-restricted-imports` overrides in `eslint.config.js`, so a violating import fails `pnpm lint` and CI: routes may not import Drizzle, `db/` or `repositories/`; services may not import Hono, Drizzle or `db/`; repositories may not import Hono, `errors.ts`, `middleware/`, `routes/` or `services/`.

**App factory:** `createApp({ db })` takes the database as a dependency instead of importing a module-level singleton, so an integration test builds the real app on a throwaway SQLite file and drives it with `app.request()`.

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
- `pageSize` defaults to **30** (the brief's default limit) and may not exceed 100: a larger value is rejected with `400 VALIDATION_ERROR`, not silently clamped. `page` must be an integer `>= 1`.
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
| POST | `/api/categories` | Extended endpoint; creates a category from its slug. `409` on a duplicate slug. |

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

A single Hono error-handling middleware (`middleware/error-handler.ts`) maps thrown domain errors to this shape, so no route hand-writes an error response. It handles three cases: an `AppError` (`ValidationError`, `NotFoundError`, `ConflictError`) becomes its own code and status and may carry `details`; a `ZodError` becomes `400 VALIDATION_ERROR` with `details` built by `zodIssuesToDetails()` from `packages/shared` (the same helper the web form uses, so paths and messages agree; an issue on the whole payload has the empty path); anything else becomes a generic `500` whose real error is logged and never sent. `app.notFound` returns the `404 NOT_FOUND` envelope for unknown routes.

## 4. Data model

Product fields mirror the brief's payload exactly, so seed data loads unchanged.

| Field | Type | Rules |
|---|---|---|
| `id` | integer | `INTEGER PRIMARY KEY AUTOINCREMENT`. Seeded rows keep ids `1..N`. |
| `title` | string | required, 1-200 chars |
| `description` | string | required, up to 2000 chars |
| `category` | string (slug) | required. Stored as `category_id`, an integer FK to `categories(id)` with `ON DELETE RESTRICT`; the wire value is the category's slug |
| `price` | number | required, `>= 0`, 2-decimal currency |
| `stock` | integer | required, `>= 0` |
| `brand` | string | required |
| `sku` | string | required, **unique** |
| `weight` | number | required, `> 0` |
| `meta.createdAt` | ISO 8601 string | server-owned |
| `meta.updatedAt` | ISO 8601 string | server-owned, refreshed on every PATCH |

**Validation details** (defined once in `packages/shared`, so API and form messages match):

- `title`, `brand` and `sku` are trimmed and non-empty, with maximum lengths of 200, 100 and 64. `description` is 1-2000 characters and is not trimmed.
- `category` must be a lowercase slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 50 characters).
- `price` is rejected if it has more than 2 decimal places; it is never rounded.
- `PATCH` accepts any non-empty subset of the create fields; an empty body is a `400`.
- `id` and `meta` are stripped from create and patch bodies rather than rejected.
- A `category` slug that matches no row in `categories` is rejected with `400 VALIDATION_ERROR` naming `category`; a category is never created implicitly by a product write.

**Storage vs. wire shape:** `meta` is stored as flat `created_at` / `updated_at` columns and re-nested by a serializer at the route boundary. The brief's JSON shape is preserved without a nested-object column. Likewise `category_id` is resolved to the category's slug on the way out, and the slug back to an id on the way in, so the wire contract never exposes the surrogate key.

**Categories:** `categories(id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE)`. A slug is the only attribute for now; a display name can be added by a later migration if the UI needs one. SQLite ignores foreign keys unless `PRAGMA foreign_keys = ON` is set on each connection, so `createDb()` does that. Deleting a category that still has products is refused (SQLite reports it as `SQLITE_CONSTRAINT_TRIGGER`; inserting a product for a missing category is `SQLITE_CONSTRAINT_FOREIGNKEY`).

**Migrations:** `pnpm --filter @catalog/api db:generate` runs drizzle-kit against `schema.ts` and writes SQL into `apps/api/src/db/migrations/`, which is committed. `pnpm db:migrate` applies pending migrations (creating the database file and its directory if absent) and is safe to re-run.

**Server-owned fields:** `id` and both timestamps are ignored if a client sends them. Integer ids were kept over UUIDs because the brief's sample payload uses them and insertion order stays meaningful.

**Seeding:** `apps/api/src/db/seed.ts` loads `apps/api/src/db/seed.json`: 36 whimsical ACME-style products in the brief's exact payload shape (explicit ids `1..N` and nested `meta`; rows 1 and 2 are the brief's own samples, verbatim) across 6 categories and 5 fictional brands, with 5 out-of-stock and 7 low-stock (1-5) products so filters and metrics have something to show. Every row is validated with the shared `productSchema` before anything is inserted, so bad seed data fails loudly and cannot drift from the contract.

Run via `pnpm db:seed`, which applies pending migrations first, so a fresh checkout needs only that command. It creates each distinct category slug, then inserts the products with `category_id` resolved from the slug, inside one transaction. Both inserts use `ON CONFLICT DO NOTHING`, so re-running is safe: row counts do not change, an edit you made to a seeded product is never overwritten, and a seeded row you deleted comes back. The consequence is that editing `seed.json` later does not update rows that already exist; to reset, delete the database file and run `pnpm db:seed` again. Rejected: upserting by `sku` (would clobber edits) and wipe-and-reload (would delete products you created).

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

**CI:** `.github/workflows/ci.yml` on push and pull request - `pnpm install --frozen-lockfile` -> `tsc --noEmit` -> lint -> `vitest run` -> `pnpm audit`.

**Pre-commit hook:** `.husky/pre-commit` runs `pnpm audit`. It needs network access to the registry, so a commit made offline fails; bypass with `git commit --no-verify` only when offline, and CI still enforces the audit.

Playwright end-to-end coverage is deliberately out of scope for the initial window and is documented as a next step in `README.md`.

## 7. Open decisions

1. **Category modelling - resolved 2026-09-19: option (a), a `categories` table with `products.category_id` FK.** It makes create/list/filter-by-category honest and prevents typo'd categories, and the database enforces it. Rejected: (b) a plain text column with `DISTINCT` - no validation, and a category cannot exist before a product uses it, so "create a category" would be hollow; (c) a registry table with no FK - allows a product to drift onto an unregistered slug. A variant using the slug itself as the primary key (`products.category` referencing `categories(slug)`) would have avoided the join, but the surrogate-id form was chosen. The API exposes `category` as a string slug either way, so the wire contract is unchanged; the cost is a join (or subquery) on category reads and filters, and a service-level check that a slug exists before a product write.
2. **Unprompted custom feature** (the brief requires at least one, documented with problem, persona and rationale). Candidates: low-stock alerts with inventory metrics, an audit log of mutations, bulk operations, or CSV import/export. The choice also determines the contents of the SPA metric strip.

The remaining decision (#2) must be resolved before the code it affects is written. However it lands, this document and `README.md` get updated with the reasoning.

## 8. Conventions

- Local dev: API on `:3000`, Vite dev server on `:5173` proxying `/api` - no CORS config needed in development.
- Root scripts: `pnpm dev` (both apps), `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm db:migrate`, `pnpm db:seed`.
- pnpm is the only supported package manager: the version is pinned in the root `packageManager` field (enable with `corepack enable`), and only `pnpm-lock.yaml` is committed.
- Config via environment variables with sane defaults (`PORT`, `DATABASE_PATH`, and a low-stock threshold if applicable); `.env.example` committed. `apps/api/.env` (copied from `apps/api/.env.example`, gitignored) is loaded on startup by both the server and `pnpm db:migrate`, using Node's built-in `process.loadEnvFile()` - no `dotenv` dependency, which is why the Node floor is 20.12. A variable already set in the real environment always wins over the file, and a missing file is fine. The `.env.example` values are the defaults that apply when a variable is unset. A malformed `PORT` fails at startup with a clear message.
- No authentication or authorization in this scope; noted as a next step.
- Commits are small, single-line, and use a Conventional Commits prefix (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`). No message body, no footers, never a `Co-Authored-By` trailer.
- `AI.md` is updated as work proceeds, not reconstructed at the end.
