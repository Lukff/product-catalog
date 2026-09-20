# Product Catalog

A full-stack product catalog: a Svelte 5 single-page app on top of a Hono + SQLite JSON API, in a pnpm TypeScript monorepo.

> **Status.** The product catalog works end to end: list, search, sort, filter, page, view, create, edit and delete products, and add and remove categories and brands, plus low-stock alerts with inventory metrics as the custom feature. See [Status and next steps](#status-and-next-steps) for exactly what runs today.

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
| GET    | `/api/products`     | Paginated. Query: `page`, `pageSize` (default 30, max 100), `q`, `category`, `brand`, `stockStatus` (`out`, `low` or `in`), `sort` (for example `-price`).    |
| GET    | `/api/products/stats` | Catalog-wide counts by stock status and the inventory value (`price * stock`).                              |
| GET    | `/api/products/:id` | `404` if absent; a non-numeric id is a `400`.                                                                 |
| POST   | `/api/products`     | Server assigns `id` and timestamps. `201`.                                                                    |
| PATCH  | `/api/products/:id` | Any non-empty subset of fields; refreshes `meta.updatedAt`.                                                   |
| DELETE | `/api/products/:id` | `204`; `404` if absent.                                                                                       |
| GET    | `/api/categories`   | Paginated, same envelope, ordered by slug. Each item is `{ "slug" }`.                                         |
| POST   | `/api/categories`   | Creates a category from its slug. `201`; `409` on a duplicate.                                                |
| DELETE | `/api/categories/:slug` | `204`; `404` if absent; `409` while any product still uses it.                                            |
| GET    | `/api/brands`       | Paginated, same envelope, ordered by name. Each item is `{ "name" }`.                                         |
| POST   | `/api/brands`       | Creates a brand from its name. `201`; `409` on a duplicate.                                                   |
| DELETE | `/api/brands/:name` | `204`; `404` if absent; `409` while any product still uses it. The name is URL-encoded.                       |

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
- **SPA shape.** One dashboard with a detail modal, because the catalog is a single workflow. Query state lives in a runes store (`catalog`) and is mirrored into the URL so a filtered view is shareable and the back button works. Only params that differ from the defaults are written to the URL, and an invalid link falls back to the default list. The search box is debounced by 300 ms.
- **One modal for detail, create, edit and delete.** A native `<dialog>` gives Escape-to-close, a focus trap and focus restoration for free. A dialog store moves it between `detail`, `edit` and `delete` views. Opening a row shows the list's data at once and refreshes it in the background from `GET /api/products/:id`.
- **One `ProductForm` for create and edit**, validated client-side with the same shared Zod schema as the API, so messages match. Its category field is a select of the existing categories, read from the same store as the toolbar; edit keeps the product's current category as an option even if the list lacks it. Server `details` map back onto the offending field. After a create the list resets to newest first; after a delete it steps back a page if the last row of a later page was removed. Delete always asks for confirmation.
- **Brands work the same way.** The toolbar has a brand select and its own "Manage" dialog, backed by a `brands` store, and the product form's brand field is a select of existing brands (placeholder on create, current brand kept on edit, a hint when there are none). The brand filter is mirrored into the URL as `?brand=`.
- **Categories are managed from the toolbar.** The category select is filled from `GET /api/categories` by a small `categories` store. Its "Manage" button opens a second dialog to add a category (one slug input) or remove one, with server errors shown inline. Removing the category the list is filtered by clears that filter.

Why these choices (and what was rejected) is in [`docs/technical-decisions.md`](docs/technical-decisions.md) section 1.

### Assumptions and product decisions

The brief left these open; the choices are recorded here.

- **PATCH only, no PUT.** One write path means one validation schema and no ambiguity about whether omitted fields are cleared.
- **Search is `?q=`**, not a `/search` route, so it composes with category, sort and paging. It is a case-insensitive substring match over `title` and `description`; `%` and `_` match themselves rather than acting as wildcards, and a blank `q` is ignored.
- **Stable paging.** Sorting ties always fall back to `id`, so pages never overlap or skip a row. `title` sorts case-insensitively. An unknown `category` slug is a filter with no matches (an empty `200`), not an error.
- **Stock status is derived, not stored.** `stockStatus()` in `packages/shared` returns `out` at 0, `low` from 1 to 5 (`LOW_STOCK_THRESHOLD`, matching the seed) and `in` otherwise.
- **Write checks run in a fixed order:** malformed JSON (`400`), schema validation (`400` with field-level `details`), category exists (`400` naming `category`), then sku uniqueness (`409`). A duplicate sku carries `details` naming `sku`, so the form shows it on the field. A product re-sending its own sku is not a conflict.
- **PATCH writes only the fields sent.** The edit form computes the changed fields and sends nothing if nothing changed.
- **Delete answers `204` once.** A second delete of the same id is `404`. Deleting a product never touches categories.
- **A category in use cannot be removed.** `DELETE /api/categories/:slug` answers `409` while any product uses it, with `details` naming `category`. Products are never reassigned or deleted for you, which matches the `ON DELETE RESTRICT` foreign key; the service checks first so the error is a clean `409` rather than a constraint failure. The dialog therefore needs no confirm step: a remove can only succeed on an unused category.
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
| `brand`          | string (name)   | Required; must match an existing brand    |
| `sku`            | string          | Required, trimmed, up to 64, **unique**   |
| `weight`         | number          | `> 0`                                     |
| `meta.createdAt` | ISO 8601 string | Server-owned                              |
| `meta.updatedAt` | ISO 8601 string | Server-owned; refreshed on every PATCH    |

- **Categories are a table**, `categories(id, slug UNIQUE)`, and `products.category_id` is a foreign key with `ON DELETE RESTRICT`. This makes create, list and filter honest and prevents typo'd categories. A product write with an unknown slug is a `400` naming `category`; a category is never created implicitly. SQLite ignores foreign keys unless `PRAGMA foreign_keys = ON`, which `createDb()` sets on every connection.
- **Brands are a table too**, `brands(id, name UNIQUE)`, with `products.brand_id` a foreign key with `ON DELETE RESTRICT`. A brand is identified by its name (not a slug), 1-100 characters and no `/` because it travels in a URL path. An unknown brand on a product write is a `400` naming `brand`, and a brand is never created implicitly. The migration backfills `brands` from the distinct `brand` text already in `products`, so an existing database keeps its data.
- **Storage differs from the wire shape.** `meta` is stored as flat `created_at` / `updated_at` columns and re-nested at the route boundary; `category_id` and `brand_id` are resolved to a slug and a name on the way out and back on the way in. The surrogate keys are never exposed.
- **Server-owned fields are stripped**, not rejected: a client-sent `id` or `meta` is ignored.
- **Migrations** are generated by `pnpm --filter @catalog/api db:generate` from `apps/api/src/db/schema.ts` into `apps/api/src/db/migrations/`, which is committed.

### Seeding

`pnpm db:seed` loads 36 ACME-style products from `apps/api/src/db/seed.json` across 6 categories and 5 fictional brands (each created as a row before the products that use it), including 5 out-of-stock and 7 low-stock products so filters and metrics have data. Rows 1 and 2 are the brief's own samples. Every row is validated with the shared `productSchema` before insert, so bad seed data fails loudly.

Seeding runs in one transaction and uses `ON CONFLICT DO NOTHING`. Re-running does not change row counts, never overwrites an edit you made to a seeded product, and restores a seeded row you deleted. The consequence is that editing `seed.json` later does not update existing rows; reset the database to pick up changes.

## Testing and CI

- **Vitest** throughout, run from the root as one project per workspace package. The web project loads the Svelte plugin so runes in `*.svelte.ts` modules compile under test.
- **API integration tests** run the real Hono app with `app.request()` against a throwaway SQLite file per suite, covering list, detail, create, update, delete, the query parameters and the categories and brands endpoints. A database test applies the brands migration to a database that holds legacy rows.
- **Unit tests** cover the shared schemas and stock helper, and on the web side the catalog, dialog, categories and brands stores, query-param and form helpers, and the API wrapper.
- **CI** (`.github/workflows/ci.yml`, on push and pull request): `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm audit`.
- **Pre-commit hook** (`.husky/pre-commit`) runs `pnpm audit`. It needs network access, so a commit made offline fails; use `git commit --no-verify` only when offline, since CI still enforces the audit.

## Custom feature

**Low-stock alerts with inventory metrics.** The brief requires at least one unprompted feature.

- **Problem.** With a catalog of a few dozen products, nobody can see at a glance what needs reordering. Finding low or empty stock means sorting by stock and reading the table.
- **Persona.** A stock manager who checks the catalog to decide what to reorder.
- **What it does.** A metric strip above the table shows the total product count, the number of low-stock and out-of-stock products, and the inventory value (`price * stock`). The Low stock and Out of stock tiles are toggle buttons: pressing one filters the table to those products, and pressing it again clears the filter. The filter is mirrored into the URL (`?stockStatus=low`), so a view can be shared, and it composes with search, category, sort and paging. The strip refreshes after every create, edit and delete.
- **API.** `GET /api/products/stats` returns `total`, `inStock`, `lowStock`, `outOfStock` and `inventoryValue`. `GET /api/products` accepts `stockStatus=low|out|in`, and any other value is a `400 VALIDATION_ERROR`. Both are in the Swagger UI.
- **Why this one.** It was the simplest option and builds directly on what already existed: the stock status rule, the seed's low and empty rows, and the list query. It needs one aggregate query and no new table or migration. It also gave the metric strip its content. Rejected: an audit log (there is no authentication, so "who changed it" is meaningless, and it needs a table and a write in every mutation), bulk operations (transaction and partial-failure rules, and the most UI work) and CSV export (little value on its own, and the strip would still need content).
- **Design choices.** The stats are catalog-wide, not scoped to the search or category, so the strip stays a stable overview. The SQL for the low and out bands uses `LOW_STOCK_THRESHOLD` from `packages/shared`, the same constant `stockStatus()` uses, so the counts cannot drift from the badges in the table. Creating a product also clears the stock filter, so the new row is never hidden.
- **Out of scope.** A configurable threshold, notifications and history of stock levels.

## Open questions

- **Low-stock threshold.** It is a constant (5) in `packages/shared`, used by the table's stock badge, the `stockStatus` filter and the stats, and chosen to match the seed data. A stock manager may want it per product or per category, which would need a column or a setting.
- **Category display names.** A category is only a slug today. A display name can be added by a later migration if the UI needs one.

## Status and next steps

Working today, end to end (API and web):

- Install, migrate, seed, and running both apps, plus the Swagger UI and OpenAPI document.
- Listing products with a numbered pager (B-06), and search, sort, category filtering and page size, mirrored into the URL (B-08).
- A detail modal, and creating a product (B-07).
- Editing and deleting a product from the modal (B-10).
- Listing, adding and removing categories, with the toolbar's category select and the product form's category select both filled from the API (B-11).
- Brands as their own table: listing, adding and removing them, a toolbar brand filter mirrored into the URL, and a brand select in the product form (B-17).
- The custom feature: the metric strip, the Low stock and Out of stock filter tiles and `GET /api/products/stats` (B-12).
- The shared contract with its tests, and CI.

Everything in the backlog's product phases is built (see [`docs/backlog.md`](docs/backlog.md)).

Known limits of the categories slice:

- The toolbar select, the product form's select and the manage dialog load at most 100 categories, the API's maximum page size. There is no paging in the UI. Editing a product whose category is missing from the list still works, because its current category is kept as an option.
- A category cannot be created from inside the product form; add it from the toolbar's Manage dialog first. The same is true of brands. Creating either inline is planned as B-18.
- Brand names are unique exactly as typed, so "ACME" and "Acme" would be two brands. Case-insensitive uniqueness would need a `COLLATE NOCASE` index in a later migration.

Smaller improvements found during reviews, such as a clearer message when the API is down and a visual design pass on the page, are collected in [`docs/improvement-opportunities.md`](docs/improvement-opportunities.md).

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
| [`docs/improvement-opportunities.md`](docs/improvement-opportunities.md) | Small improvements found in review that are not scheduled       |
| [`AI.md`](AI.md)                                           | Narrative log of the AI-assisted workflow                                     |
