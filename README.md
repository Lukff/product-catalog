# Product Catalog

A full-stack product catalog: a Svelte 5 single-page app on top of a Hono + SQLite JSON API, in a pnpm TypeScript monorepo.

> **Status.** The monorepo, shared contract, API skeleton, seed data, Swagger docs and web scaffold are in place. The product and category routes, the catalog UI and the custom feature are not built yet. See [Status and next steps](#status-and-next-steps) for exactly what runs today.

## Requirements

- Node.js 20.12 or newer (CI runs Node 22)
- pnpm, pinned in the root `packageManager` field. Enable it with `corepack enable`; no global pnpm install is needed.

No external services are required. The database is a SQLite file.

## Run it locally

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env   # optional: the defaults below apply without it
pnpm db:seed                             # applies migrations, then loads the seed data
pnpm dev                                 # API on :3000 and web on :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the API, so no CORS setup is needed.

`pnpm install` also installs the Husky pre-commit hook (through the root `prepare` script). `better-sqlite3` is pinned to 12.x so it installs a prebuilt binary and needs no C++ toolchain on Windows.

### Scripts

| Command                            | What it does                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                         | Runs the API and the web dev server together                                      |
| `pnpm db:migrate`                  | Applies pending migrations, creating the database file if absent. Safe to re-run. |
| `pnpm db:seed`                     | Runs migrations, then seeds. Safe to re-run (see [Seeding](#seeding)).            |
| `pnpm test`                        | Vitest across all workspaces                                                      |
| `pnpm typecheck`                   | `tsc --noEmit` for the API and shared package, `svelte-check` for the web app     |
| `pnpm lint`                        | ESLint and `prettier --check`                                                     |
| `pnpm format`                      | `prettier --write`                                                                |
| `pnpm --filter @catalog/api start` | Runs the API once, without file watching                                          |

### Configuration

Set in `apps/api/.env` (copied from `.env.example`, gitignored) or in the real environment, which always wins over the file.

| Variable        | Default           | Meaning                                                               |
| --------------- | ----------------- | --------------------------------------------------------------------- |
| `PORT`          | `3000`            | API port. A malformed value fails at startup with a clear message.    |
| `DATABASE_PATH` | `./data/catalog.db` | SQLite file, relative to `apps/api`. Created on first use.          |

### Resetting the database

Delete the file at `DATABASE_PATH` (default `apps/api/data/catalog.db`) and run `pnpm db:seed`.

## API documentation

With the API running:

- Swagger UI: <http://localhost:3000/api/docs>. It loads its JavaScript and CSS from the jsDelivr CDN, so this page needs internet access.
- OpenAPI 3.1 document: <http://localhost:3000/api/openapi.json> (works offline).

The document describes every operation in the contract, built from the same Zod schemas the server validates with. An operation whose route is not implemented yet is flagged "Not implemented yet" and flips on by itself when the route lands. A test fails if the app registers a route missing from the document.

### Contract at a glance

Base path `/api`, JSON only. Responses are wrapped: `{ "data": ... }`, plus `meta` (`page`, `pageSize`, `total`, `totalPages`) on collections.

| Method | Path                | Notes                                                                                                         |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/products`     | Paginated. Query: `page`, `pageSize` (default 30, max 100), `q`, `category`, `sort` (for example `-price`).    |
| GET    | `/api/products/:id` | `404` if absent.                                                                                              |
| POST   | `/api/products`     | Server assigns `id` and timestamps. `201`.                                                                    |
| PATCH  | `/api/products/:id` | Any non-empty subset of fields; refreshes `meta.updatedAt`.                                                   |
| DELETE | `/api/products/:id` | `204`; `404` if absent.                                                                                       |
| GET    | `/api/categories`   | Paginated, same envelope.                                                                                     |
| POST   | `/api/categories`   | Creates a category from its slug. `409` on a duplicate.                                                       |

Errors share one shape, `{ "error": { "code", "message", "details" } }`, with codes `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409) and `INTERNAL_ERROR` (500). The full contract is in [`docs/technical-decisions.md`](docs/technical-decisions.md) section 3.

## Architecture

```
apps/api        Hono server        routes -> services -> repositories (Drizzle + SQLite)
apps/web        Svelte 5 SPA       Vite, Tailwind v4, runes for state
packages/shared Zod schemas        the single source of the product contract
```

- **Monorepo with pnpm workspaces** (`@catalog/api`, `@catalog/web`, `@catalog/shared`). pnpm's strict `node_modules` makes an undeclared cross-workspace import a hard error.
- **One contract, defined once.** Product, query and envelope schemas live in `packages/shared`. The API validates with them, the web form validates with them, and the OpenAPI document is generated from them, so none of the three can drift.
- **Strict API layering.** Routes parse and serialize, services hold business rules, repositories run Drizzle queries. Routes never touch Drizzle; repositories never throw HTTP errors. ESLint `no-restricted-imports` overrides enforce this, so a violation fails `pnpm lint` and CI.
- **App factory.** `createApp({ db })` takes the database as a dependency instead of importing a singleton, so integration tests run the real app against a throwaway SQLite file through `app.request()`, with no live port.
- **One error path.** `middleware/error-handler.ts` maps domain errors and Zod failures to the error envelope; no route hand-writes an error response.
- **SPA shape.** One dashboard with a detail modal, because the catalog is a single workflow. Query state lives in a runes store and is mirrored into the URL so a filtered view is shareable and the back button works.

Why these choices (and what was rejected) is in [`docs/technical-decisions.md`](docs/technical-decisions.md) section 1.

### Assumptions and product decisions

The brief left these open; the choices are recorded here.

- **PATCH only, no PUT.** One write path means one validation schema and no ambiguity about whether omitted fields are cleared.
- **Search is `?q=`**, not a `/search` route, so it composes with category, sort and paging. It is a case-insensitive substring match over `title` and `description`.
- **Page-based paging** rather than offset/limit, to support a numbered pager. Trade-off: page numbers shift if rows are inserted between requests, which is acceptable for a single-user local catalog.
- **An oversized `pageSize` is rejected** with `400`, not silently clamped.
- **Sort fields are whitelisted:** `title`, `price`, `stock`, `weight`, `createdAt`, `updatedAt`. Anything else is a `400`.
- **Integer ids**, matching the brief's sample payload; insertion order stays meaningful.
- **No authentication or authorization** in this scope (see next steps).

## Data model

Product fields mirror the brief's payload, so the seed data loads unchanged.

| Field            | Type            | Rules                                     |
| ---------------- | --------------- | ----------------------------------------- |
| `id`             | integer         | Autoincrement primary key; server-owned   |
| `title`          | string          | Required, trimmed, 1-200 characters       |
| `description`    | string          | Required, up to 2000 characters           |
| `category`       | string (slug)   | Required; must match an existing category |
| `price`          | number          | `>= 0`, at most 2 decimals; never rounded |
| `stock`          | integer         | `>= 0`                                    |
| `brand`          | string          | Required, trimmed, up to 100 characters   |
| `sku`            | string          | Required, trimmed, up to 64, **unique**   |
| `weight`         | number          | `> 0`                                     |
| `meta.createdAt` | ISO 8601 string | Server-owned                              |
| `meta.updatedAt` | ISO 8601 string | Server-owned; refreshed on every PATCH    |

- **Categories are a table**, `categories(id, slug UNIQUE)`, and `products.category_id` is a foreign key with `ON DELETE RESTRICT`. This makes create, list and filter honest and prevents typo'd categories. A product write with an unknown slug is a `400` naming `category`; a category is never created implicitly. SQLite ignores foreign keys unless `PRAGMA foreign_keys = ON`, which `createDb()` sets on every connection.
- **Storage differs from the wire shape.** `meta` is stored as flat `created_at` / `updated_at` columns and re-nested at the route boundary; `category_id` is resolved to a slug on the way out and back on the way in. The surrogate key is never exposed.
- **Server-owned fields are stripped**, not rejected: a client-sent `id` or `meta` is ignored.
- **Migrations** are generated by `pnpm --filter @catalog/api db:generate` from `apps/api/src/db/schema.ts` into `apps/api/src/db/migrations/`, which is committed.

### Seeding

`pnpm db:seed` loads 36 ACME-style products from `apps/api/src/db/seed.json` across 6 categories and 5 fictional brands, including 5 out-of-stock and 7 low-stock products so filters and metrics have data. Rows 1 and 2 are the brief's own samples. Every row is validated with the shared `productSchema` before insert, so bad seed data fails loudly.

Seeding runs in one transaction and uses `ON CONFLICT DO NOTHING`. Re-running does not change row counts, never overwrites an edit you made to a seeded product, and restores a seeded row you deleted. The consequence is that editing `seed.json` later does not update existing rows; reset the database to pick up changes.

## Testing and CI

- **Vitest** throughout. API integration tests run the real Hono app with `app.request()` against a throwaway SQLite file per suite; unit tests cover the shared schemas and query parsing.
- **CI** (`.github/workflows/ci.yml`, on push and pull request): `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm audit`.
- **Pre-commit hook** (`.husky/pre-commit`) runs `pnpm audit`. It needs network access, so a commit made offline fails; use `git commit --no-verify` only when offline, since CI still enforces the audit.

## Custom feature

**Not decided yet.** The brief requires at least one unprompted feature, documented with problem, persona and rationale. Candidates under consideration are low-stock alerts with inventory metrics, an audit log of mutations, bulk operations, and CSV import or export. The seed data already includes out-of-stock and low-stock rows, which favours the inventory-metrics candidate, but nothing is committed to.

This section will be filled in with the problem it solves, the intended persona and why it was chosen once the decision is made. The choice also fixes the contents of the dashboard's metric strip.

## Open questions

- **Custom feature** (above): the one unresolved product decision. Code it affects is deliberately not written yet.
- **Low-stock threshold.** The seed treats 1-5 units as low stock. If the custom feature turns on that, the threshold becomes an environment variable.
- **Category display names.** A category is only a slug today. A display name can be added by a later migration if the UI needs one.

## Status and next steps

Working today: install, migrate, seed, running both apps, the Swagger UI and the OpenAPI document, the shared contract with its tests, and CI.

Not built yet, in backlog order (see [`docs/backlog.md`](docs/backlog.md)):

1. Product list endpoint and dashboard table (B-06)
2. Product detail modal (B-07)
3. Search, sort, filter and pagination (B-08)
4. Create, edit and delete products (B-09, B-10)
5. Categories endpoints and UI (B-11)
6. The custom feature and metric strip (B-12), once decided

Deliberately out of scope for the initial window, and documented here as next steps:

- **Playwright end-to-end coverage.** Integration tests through `app.request()` cover the API contract, but nothing drives a real browser through the SPA yet.
- **Authentication and authorization.** Every endpoint is open. Adding it means choosing a scheme and protecting the write routes at minimum.
- **Offline Swagger UI.** `/api/docs` depends on the jsDelivr CDN; vendoring the assets would remove that.

## Documentation map

| File                                                       | Role                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`docs/project-brief.md`](docs/project-brief.md)           | The requirements                                                              |
| [`docs/technical-decisions.md`](docs/technical-decisions.md) | Stack, layout, API contract, data model, SPA design, testing, conventions   |
| [`docs/backlog.md`](docs/backlog.md)                       | Work items and their status                                                   |
| [`AI.md`](AI.md)                                           | Narrative log of the AI-assisted workflow                                     |
