# Backlog

Work items for the Full Stack Product Catalog. Requirements come from
`project-brief.md`; the technical contracts every item must honor are in
`technical-decisions.md`. This file tracks **what is left to do and in what
order** — nothing else.

- Status values: `Todo`, `In progress`, `Blocked`, `Done`.
- Items are sequenced as a walking skeleton: one thin end-to-end slice first,
  then feature slices. Each feature item is a vertical slice covering both the API
  and the Web side, built API first.
- Tests are not separate items. Each item's acceptance criteria name the tests
  from `technical-decisions.md` §6 that prove it.

---

## Open decisions

These are not work items. They gate the items listed under each one and must be
resolved — with `technical-decisions.md` updated in the same change — before
that code is written.

### D-1 — Category modelling

**Resolved 2026-09-19:** a `categories` table with `products.category_id` as an
integer FK (`technical-decisions.md` §7.1 option a). The wire contract is unchanged
(`category` stays a string slug). Schema landed with B-03.

**Gated:** B-11 — now unblocked.

### D-2 — Unprompted custom feature

See `technical-decisions.md` §7.2. Candidates: low-stock alerts with inventory
metrics, audit log of mutations, bulk operations, CSV import/export. The choice
also determines the contents of the SPA metric strip. Must be documented with
problem, persona and rationale.

**Gates:** B-12.

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

**Status:** Done
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

**Status:** Done
**Depends on:** B-02

- `app.ts` exports a `createApp({ db })` factory returning the Hono app, so tests
  can use `app.request()` on a throwaway database without a port; `index.ts` only
  binds the port.
- Error middleware maps domain errors to the §3.3 shapes for
  `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`.
- Unknown route returns `404 NOT_FOUND` in the envelope, not Hono's default.
- Drizzle schema for `products` (flat `created_at` / `updated_at` columns, a unique
  index on `sku`, `category_id` FK) and `categories` (unique `slug`); migration
  generated and `pnpm db:migrate` works from a clean checkout.
- `routes -> services -> repositories` directories exist and the layering rule
  holds, enforced by ESLint `no-restricted-imports` so a violation fails lint.

### B-04 — Seed data

**Status:** Done
**Depends on:** B-03

- `seed.json` holds ~30–40 products across several categories and brands, using
  the brief's exact payload shape.
- Some rows have deliberately low or zero stock so filters and metrics have
  something to show.
- The seed creates each distinct category slug in `seed.json` before inserting the
  products that reference it, so `category_id` resolves.
- `pnpm db:seed` is idempotent — running it twice leaves the same row count, for
  categories as well as products.

### B-05 — Web scaffold

**Status:** Done
**Depends on:** B-02

- Vite + Svelte 5 + Tailwind app builds and serves.
- Dev proxy `/api` to `http://localhost:3000`, so no CORS config in development.
- `lib/api.ts` is a typed fetch wrapper that unwraps `data`, surfaces the error
  envelope as a typed rejection, and imports its types from `packages/shared`.
- `pnpm dev` from the root starts both apps.

---

## Phase 1 — Walking skeleton

### B-06 — List products

**Status:** Done
**Depends on:** B-03, B-04, B-05

API:

- `GET /api/products` returns the envelope with `data` and `meta`.
- Defaults to `pageSize` 30; `pageSize` above 100 is rejected with `400 VALIDATION_ERROR`, never clamped.
- `meta.total` is the count after filters and before pagination;
  `meta.totalPages` is consistent with it.
- Integration test asserts the default page size and the `meta` values.
- Scope note: B-06 applies `page` and `pageSize` only, ordered by `id`. `q`, `category` and `sort` are validated by the shared schema but take effect in B-08.

Web:

- Dashboard view renders `ProductTable` from the live API — the first
  end-to-end slice.
- Catalog store (Svelte 5 runes) holds query params and results.
- Explicit loading, error and empty states for the list.
- Stock status is shown inline on each row.

---

## Phase 2 — Read slices

### B-07 — Product detail and create product

**Status:** Done
**Depends on:** B-06, B-08

Merged 2026-09-20 from the former B-07 (product detail) and B-09 (create product), so the
first write path lands together with the modal that hosts it.

API:

- `GET /api/products/:id` returns `{ "data": { ... } }`.
- Unknown id returns `404 NOT_FOUND` in the error envelope.
- Non-numeric id returns `400 VALIDATION_ERROR`.
- `POST /api/products` validates the full body and returns `201` with the
  created record.
- `id`, `meta.createdAt` and `meta.updatedAt` are server-assigned and ignored if
  the client sends them.
- Negative price returns `400 VALIDATION_ERROR` with `details` naming `price`.
- A `category` slug with no matching category returns `400 VALIDATION_ERROR` with
  `details` naming `category`; a product write never creates a category.
- Duplicate `sku` returns `409 CONFLICT`.

Web:

- Clicking a row opens a modal showing the full record.
- Modal has Edit and Delete affordances (wired in B-10).
- Closes on escape and on backdrop click; focus is trapped while open.
- One `ProductForm` component, validated client-side with the same shared Zod
  schema the API uses, so messages match. A "New product" button on the dashboard
  opens it in the same modal shell as the detail view.
- On success the list refreshes and the new product is visible.
- Server `details` entries map back onto the offending form fields — a duplicate
  sku surfaces on the sku field, not as a banner.
- Explicit pending and error states on submit.

### B-08 — Search, sort, filter and pagination

**Status:** Done
**Depends on:** B-06

API:

- `?q=` is a case-insensitive substring match over `title` **and**
  `description`, and composes with the other params.
- `?sort=-price` and `?sort=stock` order correctly across the whitelist
  (`title`, `price`, `stock`, `weight`, `createdAt`, `updatedAt`).
- `?sort=bogus` returns `400 VALIDATION_ERROR`.
- `?category=` filters; combining `q`, `category`, `sort` and `page` yields
  correct `meta.total`.
- Integration tests cover case-insensitive description match, `-price` ordering
  and the rejected sort field.
- Replaces B-06's fixed `id` order and applies `q`, `category` and `sort` in the repository. Ties always fall back to `id`, so paging is stable.

Web:

- Debounced search box, sort select and page-size select drive the catalog
  store.
- Numbered pager reflects `meta.page` / `meta.totalPages`; disabled at the ends.
- Query params are mirrored into the URL so a filtered view is shareable and the
  back button restores the previous query.
- Changing any filter resets to page 1.
- The category select is present but populated in B-11: it is disabled until then, although a `?category=` in the URL already filters the list.

---

## Phase 3 — Write slices

### B-09 — Create product

**Status:** Merged into B-07 (2026-09-20). The ID is kept so earlier references still resolve.

### B-10 — Edit and delete product

**Status:** Done
**Depends on:** B-07

API:

- `PATCH /api/products/:id` accepts any subset of fields and returns `200`.
- `meta.updatedAt` is refreshed; `meta.createdAt` is untouched.
- Unknown id returns `404`; duplicate `sku` returns `409`; an unknown `category`
  slug returns `400 VALIDATION_ERROR` naming `category`.
- Integration test asserts both the field change and the bumped `updatedAt`.
- `DELETE /api/products/:id` returns `204` with an empty body.
- A second delete of the same id returns `404`.

Web:

- Edit reuses `ProductForm` pre-filled from the record - no second form
  component.
- Only changed fields are sent.
- The detail modal and the list both reflect the update without a full reload.
- Delete requires a confirmation step - destructive actions are never one click.
- On delete success the modal closes and the list refreshes, staying on a valid
  page if the last row of the page was removed.

---

## Phase 4 — Categories and the custom feature

B-11 was unblocked by D-1; B-12 remains blocked on D-2.

### B-11 — Categories

**Status:** Todo
**Depends on:** B-03, B-08

API:

- `GET /api/categories` returns the paginated envelope.
- `POST /api/categories` creates a category from its slug, validated with the
  shared slug schema; a duplicate slug returns `409 CONFLICT`.
- `?category=` on the products list stays consistent with what the categories
  endpoint reports.
- The wire contract (`category` as a string slug) is unchanged; the surrogate
  `category_id` never appears in a response.

Web:

- The toolbar's category select is populated from `GET /api/categories` rather
  than hardcoded.
- Selecting a category filters the list and is reflected in the URL.

### B-12 — Custom feature and metric strip

**Status:** Blocked — D-2
**Depends on:** B-06, D-2

- Scope, endpoints and acceptance criteria to be filled in once D-2 is resolved.
- Whatever it is, it ships with integration tests and is documented in
  `README.md` with problem, persona and rationale.
- Web: metric strip contents follow from D-2.
- The feature is reachable from the dashboard without a second navigation level.

---

## Phase 5 — Cross-cutting

### B-13 — CI workflow

**Status:** In progress — workflow written, not yet run on GitHub
**Depends on:** B-01

- `.github/workflows/ci.yml` runs on push and pull request.
- Steps: `pnpm install --frozen-lockfile`, `tsc --noEmit`, lint, `vitest run`,
  `pnpm audit`.
- Green on a clean checkout of `main`.

### B-14 — README

**Status:** Todo
**Depends on:** B-05

- Complete local setup: install, migrate, seed, run both apps.
- Points to the API docs at `/api/docs` (Swagger UI) and `/api/openapi.json`.
- Architecture notes, data-model notes and open questions.
- Rationale for the custom feature (problem, persona, why chosen).
- Everything left incomplete is written up as a documented next step —
  including Playwright end-to-end coverage and authentication, both deliberately
  out of scope.

### B-15 — AI.md kept current

**Status:** Ongoing
**Depends on:** —

- An entry after each significant step — a slice completed, a decision made or
  reversed, a course correction, a notable prompting technique, an open decision
  resolved — written as work proceeds, not reconstructed at the end.
- Entries use the `ai-log` skill and are never written without the user's own
  input.

### B-16 — API documentation (Swagger)

**Status:** Done
**Depends on:** B-03

- Swagger UI at `/api/docs` and the OpenAPI 3.1 document at `/api/openapi.json`,
  describing every operation in `technical-decisions.md` §3.2.
- Schemas are generated from `packages/shared`; operations without a route are
  flagged "Not implemented yet" automatically.
- **Standing rule for every API item (B-06 onward):** a new route must have its
  operation in `apps/api/src/openapi/document.ts`. A test fails otherwise.

---

## Renumbering (2026-09-19)

Items from B-06 onward were merged into vertical slices and renumbered. B-01 to
B-05 are unchanged. `AI.md` entries and earlier commits and PRs use the old IDs.

| New | Old |
|---|---|
| B-06 | B-06, B-07 |
| B-07 | B-08, B-09 |
| B-08 | B-10, B-11 |
| B-09 | B-12, B-13 |
| B-10 | B-14, B-15, B-16, B-17 |
| B-11 | B-18, B-19 |
| B-12 | B-20, B-21 |
| B-13 | B-22 |
| B-14 | B-23 |
| B-15 | B-24 |
| B-16 | B-25 |

## Merge (2026-09-20)

B-09 (create product) was folded into B-07 (product detail), now "Product detail and
create product". IDs were not renumbered: B-08 is already done and is referenced by
commits, PR #8 and `AI.md`. B-09 stays in the file as a pointer, B-10 now depends on
B-07 alone, and B-07 depends on B-06 and B-08.
