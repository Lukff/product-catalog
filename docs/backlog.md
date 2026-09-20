# Backlog

Work items for the Full Stack Product Catalog. Requirements come from
`project-brief.md`; the technical contracts every item must honor are in
`technical-decisions.md`. This file tracks **what is left to do and in what
order** — nothing else.

- Status values: `Todo`, `In progress`, `Blocked`, `Done`.
- Items are sequenced as a walking skeleton: one thin end-to-end slice first,
  then feature slices. Each slice is split into an API item and a Web item, and
  the Web item depends on its API counterpart.
- Tests are not separate items. Each item's acceptance criteria name the tests
  from `technical-decisions.md` §6 that prove it.

---

## Open decisions

These are not work items. They gate the items listed under each one and must be
resolved — with `technical-decisions.md` updated in the same change — before
that code is written.

### D-1 — Category modelling

See `technical-decisions.md` §7.1. Options: categories table with FK, plain text
column with `DISTINCT`, or a registry table without FK. Does not change the wire
contract (`category` stays a string slug either way).

**Gates:** B-18, B-19.

### D-2 — Unprompted custom feature

See `technical-decisions.md` §7.2. Candidates: low-stock alerts with inventory
metrics, audit log of mutations, bulk operations, CSV import/export. The choice
also determines the contents of the SPA metric strip. Must be documented with
problem, persona and rationale.

**Gates:** B-20, B-21.

---

## Phase 0 — Foundations

### B-01 — Monorepo scaffold

**Status:** Done
**Depends on:** —

- pnpm workspaces root (`pnpm-workspace.yaml`, `packageManager` pinned) with `apps/api`, `apps/web`, `packages/shared` per
  `technical-decisions.md` §2.
- Shared TypeScript config; `pnpm typecheck` passes on an empty tree.
- Lint and format configured; `pnpm lint` passes.
- Root scripts present: `dev`, `test`, `typecheck`, `lint`, `db:migrate`,
  `db:seed`.
- Husky pre-commit hook runs `pnpm audit`, installed by the root `prepare`
  script.

### B-02 — Shared contract package

**Status:** Todo
**Depends on:** B-01

- `packages/shared` exports the product Zod schema matching the field rules in
  §4, with create and patch variants.
- Exports the response envelope types (`data`, `meta`) and the error shape.
- Exports the list-query schema (`page`, `pageSize`, `q`, `category`, `sort`)
  with coercion, bounds (`pageSize` default 30, cap 100) and the sort-field
  whitelist.
- Unit tests cover query-param coercion and bounds, and schema rejection of a
  negative price and a zero weight.

### B-03 — API skeleton

**Status:** Todo
**Depends on:** B-02

- `app.ts` exports the Hono app so tests can use `app.request()` without a port;
  `index.ts` only binds the port.
- Error middleware maps domain errors to the §3.3 shapes for
  `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`.
- Unknown route returns `404 NOT_FOUND` in the envelope, not Hono's default.
- Drizzle schema for `products` with flat `created_at` / `updated_at` columns and
  a unique index on `sku`; migration generated and `pnpm db:migrate` works
  from a clean checkout.
- `routes -> services -> repositories` directories exist and the layering rule
  holds.

### B-04 — Seed data

**Status:** Todo
**Depends on:** B-03

- `seed.json` holds ~30–40 products across several categories and brands, using
  the brief's exact payload shape.
- Some rows have deliberately low or zero stock so filters and metrics have
  something to show.
- `pnpm db:seed` is idempotent — running it twice leaves the same row count.

### B-05 — Web scaffold

**Status:** Todo
**Depends on:** B-02

- Vite + Svelte 5 + Tailwind app builds and serves.
- Dev proxy `/api` to `http://localhost:3000`, so no CORS config in development.
- `lib/api.ts` is a typed fetch wrapper that unwraps `data`, surfaces the error
  envelope as a typed rejection, and imports its types from `packages/shared`.
- `pnpm dev` from the root starts both apps.

---

## Phase 1 — Walking skeleton

### B-06 — (API) List products

**Status:** Todo
**Depends on:** B-03, B-04

- `GET /api/products` returns the envelope with `data` and `meta`.
- Defaults to `pageSize` 30; `pageSize` above 100 is rejected or capped per the
  shared schema.
- `meta.total` is the count after filters and before pagination;
  `meta.totalPages` is consistent with it.
- Integration test asserts the default page size and the `meta` values.

### B-07 — (Web) Dashboard and product table

**Status:** Todo
**Depends on:** B-05, B-06

- Dashboard view renders `ProductTable` from the live API — the first
  end-to-end slice.
- Catalog store (Svelte 5 runes) holds query params and results.
- Explicit loading, error and empty states for the list.
- Stock status is shown inline on each row.

---

## Phase 2 — Read slices

### B-08 — (API) Get one product

**Status:** Todo
**Depends on:** B-06

- `GET /api/products/:id` returns `{ "data": { ... } }`.
- Unknown id returns `404 NOT_FOUND` in the error envelope.
- Non-numeric id returns `400 VALIDATION_ERROR`.

### B-09 — (Web) Product detail modal

**Status:** Todo
**Depends on:** B-07, B-08

- Clicking a row opens a modal showing the full record.
- Modal has Edit and Delete affordances (wired in B-15 and B-17).
- Closes on escape and on backdrop click; focus is trapped while open.

### B-10 — (API) Search, sort and category filter

**Status:** Todo
**Depends on:** B-06

- `?q=` is a case-insensitive substring match over `title` **and**
  `description`, and composes with the other params.
- `?sort=-price` and `?sort=stock` order correctly across the whitelist
  (`title`, `price`, `stock`, `weight`, `createdAt`, `updatedAt`).
- `?sort=bogus` returns `400 VALIDATION_ERROR`.
- `?category=` filters; combining `q`, `category`, `sort` and `page` yields
  correct `meta.total`.
- Integration tests cover case-insensitive description match, `-price` ordering
  and the rejected sort field.

### B-11 — (Web) Toolbar, pagination and URL state

**Status:** Todo
**Depends on:** B-07, B-10

- Debounced search box, sort select and page-size select drive the catalog
  store.
- Numbered pager reflects `meta.page` / `meta.totalPages`; disabled at the ends.
- Query params are mirrored into the URL so a filtered view is shareable and the
  back button restores the previous query.
- Changing any filter resets to page 1.
- The category select is present but populated in B-19.

---

## Phase 3 — Write slices

### B-12 — (API) Create product

**Status:** Todo
**Depends on:** B-06

- `POST /api/products` validates the full body and returns `201` with the
  created record.
- `id`, `meta.createdAt` and `meta.updatedAt` are server-assigned and ignored if
  the client sends them.
- Negative price returns `400 VALIDATION_ERROR` with `details` naming `price`.
- Duplicate `sku` returns `409 CONFLICT`.

### B-13 — (Web) Create product form

**Status:** Todo
**Depends on:** B-11, B-12

- One `ProductForm` component, validated client-side with the same shared Zod
  schema the API uses, so messages match.
- On success the list refreshes and the new product is visible.
- Server `details` entries map back onto the offending form fields — a duplicate
  sku surfaces on the sku field, not as a banner.
- Explicit pending and error states on submit.

### B-14 — (API) Update product

**Status:** Todo
**Depends on:** B-08

- `PATCH /api/products/:id` accepts any subset of fields and returns `200`.
- `meta.updatedAt` is refreshed; `meta.createdAt` is untouched.
- Unknown id returns `404`; duplicate `sku` returns `409`.
- Integration test asserts both the field change and the bumped `updatedAt`.

### B-15 — (Web) Edit product

**Status:** Todo
**Depends on:** B-09, B-13, B-14

- Edit reuses `ProductForm` pre-filled from the record — no second form
  component.
- Only changed fields are sent.
- The detail modal and the list both reflect the update without a full reload.

### B-16 — (API) Delete product

**Status:** Todo
**Depends on:** B-08

- `DELETE /api/products/:id` returns `204` with an empty body.
- A second delete of the same id returns `404`.

### B-17 — (Web) Delete product

**Status:** Todo
**Depends on:** B-09, B-16

- Delete requires a confirmation step — destructive actions are never one click.
- On success the modal closes and the list refreshes, staying on a valid page if
  the last row of the page was removed.

---

## Phase 4 — Blocked on open decisions

### B-18 — (API) Categories endpoints

**Status:** Blocked — D-1
**Depends on:** B-03, D-1

- `GET /api/categories` returns the paginated envelope.
- `POST /api/categories` creates a category; request shape follows whatever D-1
  decides.
- `?category=` on the products list stays consistent with whatever the categories
  endpoint reports.
- The wire contract (`category` as a string slug) is unchanged either way.

### B-19 — (Web) Category filter

**Status:** Blocked — D-1
**Depends on:** B-11, B-18

- The toolbar's category select is populated from `GET /api/categories` rather
  than hardcoded.
- Selecting a category filters the list and is reflected in the URL.

### B-20 — (API) Custom feature

**Status:** Blocked — D-2
**Depends on:** B-06, D-2

- Scope, endpoints and acceptance criteria to be filled in once D-2 is resolved.
- Whatever it is, it ships with integration tests and is documented in
  `README.md` with problem, persona and rationale.

### B-21 — (Web) Metric strip and custom feature UI

**Status:** Blocked — D-2
**Depends on:** B-07, B-20

- Metric strip contents follow from D-2.
- The feature is reachable from the dashboard without a second navigation level.

---

## Phase 5 — Cross-cutting

### B-22 — CI workflow

**Status:** In progress — workflow written, not yet run on GitHub
**Depends on:** B-01

- `.github/workflows/ci.yml` runs on push and pull request.
- Steps: `pnpm install --frozen-lockfile`, `tsc --noEmit`, lint, `vitest run`,
  `pnpm audit`.
- Green on a clean checkout of `main`.

### B-23 — README

**Status:** Todo
**Depends on:** B-05

- Complete local setup: install, migrate, seed, run both apps.
- Architecture notes, data-model notes and open questions.
- Rationale for the custom feature (problem, persona, why chosen).
- Everything left incomplete is written up as a documented next step —
  including Playwright end-to-end coverage and authentication, both deliberately
  out of scope.

### B-24 — AI.md kept current

**Status:** Ongoing
**Depends on:** —

- An entry after each significant step — a slice completed, a decision made or
  reversed, a course correction, a notable prompting technique, an open decision
  resolved — written as work proceeds, not reconstructed at the end.
- Entries use the `ai-log` skill and are never written without the user's own
  input.
