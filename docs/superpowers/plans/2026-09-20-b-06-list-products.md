# B-06 List Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first end-to-end slice: `GET /api/products` (pagination only) and a dashboard that renders the live list with loading, error and empty states and an inline stock status per row.

**Architecture:** API is `routes -> services -> repositories`. The repository returns flat rows with the category slug joined in; the service turns them into wire `Product`s (nested `meta`) and computes `meta`; the route parses the query with the shared `listQuerySchema`. On the web, a runes-based `CatalogStore` owns query params and results; `Dashboard` renders it through `ProductTable`. The stock-status rule lives in `packages/shared` so API and web share one definition.

**Tech Stack:** TypeScript, Hono, Drizzle + better-sqlite3, Zod (`packages/shared`), Svelte 5 runes, Tailwind v4, Vitest 5, pnpm workspaces.

**Spec:** No separate spec file, by agreement — the design was approved in conversation and lands in `docs/technical-decisions.md` (Task 6). Requirements: `docs/backlog.md` item B-06; contracts: `docs/technical-decisions.md` §3 (API), §4 (data model), §5 (SPA), §6 (tests).

## Global Constraints

- Branch: `feat/b-06-list-products` (already created). Never commit to `main`.
- Commit messages: a single line with a Conventional Commits prefix (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`). No body, no footers, never a `Co-Authored-By` trailer (project rule; it overrides any tool default).
- The pre-commit hook runs `pnpm audit` and needs network access. Do not use `--no-verify` unless offline.
- Layering is enforced by ESLint: routes may not import `drizzle-orm`, `better-sqlite3`, `**/db/**` or `**/repositories/**`; services may not import `hono`, `drizzle-orm`, `**/db/**`, `**/routes/**` or `**/middleware/**`; repositories may not import `hono`, `**/errors`, `**/middleware/**`, `**/routes/**` or `**/services/**`.
- Never duplicate the product contract: import `Product`, `PageMeta`, `ListResponse`, `listQuerySchema`, `stockStatus` from `@catalog/shared`.
- `pageSize` defaults to 30, max 100; out-of-range values are rejected with `400 VALIDATION_ERROR`, never clamped.
- `packages/shared` is consumed as source (`"exports": { ".": "./src/index.ts" }`); imports inside it use the `.js` suffix (`'./stock.js'`).
- TypeScript is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type` for types).
- Prettier: single quotes, semicolons, trailing commas, print width 100. Run `pnpm exec prettier --write <files>` if `pnpm lint` reports formatting.
- Baseline before this plan: `pnpm test` = 11 files, 153 tests, all passing.
- Scope boundary: B-06 implements page/pageSize only, ordered by `id` ascending. `q`, `category` and valid `sort` values are accepted by the shared schema but have no effect until B-08. Do not implement them, and do not add a pager, search box, sort select or URL mirroring to the web app (B-08).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/shared/src/stock.ts` | Create | `LOW_STOCK_THRESHOLD`, `StockStatus`, `stockStatus()` |
| `packages/shared/src/index.ts` | Modify | re-export `stock.js` |
| `packages/shared/test/stock.test.ts` | Create | boundary tests for `stockStatus` |
| `apps/api/src/repositories/product-repository.ts` | Create | Drizzle query: a page of rows + total count |
| `apps/api/src/services/product-service.ts` | Create | offset/`meta` maths, row -> wire `Product` |
| `apps/api/src/routes/products.ts` | Create | `GET /` parsing `listQuerySchema` |
| `apps/api/src/app.ts` | Modify | compose repository -> service -> route, mount at `/api/products` |
| `apps/api/test/products.test.ts` | Create | integration tests through `app.request()` |
| `apps/api/test/openapi.test.ts` | Modify | implemented-status tests no longer assume zero routes |
| `vitest.config.ts` | Create | root Vitest `projects` |
| `apps/web/vitest.config.ts` | Create | web project with the Svelte plugin so runes compile in tests |
| `apps/web/tsconfig.json` | Modify | include `vitest.config.ts` |
| `apps/web/src/lib/stores/catalog.svelte.ts` | Create | `CatalogStore` (runes) and the `catalog` singleton |
| `apps/web/test/catalog.test.ts` | Create | store unit tests with stubbed `fetch` |
| `apps/web/src/components/ProductTable.svelte` | Create | table rows + stock badge |
| `apps/web/src/views/Dashboard.svelte` | Create | loading / error / empty / table states |
| `apps/web/src/App.svelte` | Modify | render `Dashboard` |
| `docs/technical-decisions.md`, `docs/backlog.md` | Modify | record the decisions, mark B-06 Done |

---

### Task 1: Shared stock status

**Files:**
- Create: `packages/shared/src/stock.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/stock.test.ts`

**Interfaces:**
- Produces: `LOW_STOCK_THRESHOLD: 5`; `type StockStatus = 'out' | 'low' | 'in'`; `stockStatus(stock: number): StockStatus` (0 -> `'out'`, 1..5 -> `'low'`, above 5 -> `'in'`). Task 5 imports these from `@catalog/shared`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/test/stock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LOW_STOCK_THRESHOLD, stockStatus } from '../src/index.js';

describe('stockStatus', () => {
  it('is out of stock at zero', () => {
    expect(stockStatus(0)).toBe('out');
  });

  it('is low from 1 up to and including the threshold', () => {
    expect(stockStatus(1)).toBe('low');
    expect(stockStatus(LOW_STOCK_THRESHOLD)).toBe('low');
  });

  it('is in stock above the threshold', () => {
    expect(stockStatus(LOW_STOCK_THRESHOLD + 1)).toBe('in');
    expect(stockStatus(500)).toBe('in');
  });

  it('uses a threshold of 5, matching the seed data (low stock is 1-5)', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/shared/test/stock.test.ts`
Expected: FAIL — `stockStatus` / `LOW_STOCK_THRESHOLD` is not exported from `../src/index.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/stock.ts`:

```ts
/** A product with at most this many units left (and at least one) is "low stock". */
export const LOW_STOCK_THRESHOLD = 5;

export type StockStatus = 'out' | 'low' | 'in';

/** Derives the stock status shown in the UI. Not a wire field: the API never sends it. */
export function stockStatus(stock: number): StockStatus {
  if (stock <= 0) return 'out';
  return stock <= LOW_STOCK_THRESHOLD ? 'low' : 'in';
}
```

Modify `packages/shared/src/index.ts` — add a line so the file reads (alphabetical):

```ts
export * from './category.js';
export * from './envelope.js';
export * from './error-details.js';
export * from './json-schema.js';
export * from './product.js';
export * from './query.js';
export * from './stock.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/shared/test/stock.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Lint, typecheck, commit**

Run: `pnpm lint && pnpm typecheck`
Expected: both exit 0.

```bash
git add packages/shared/src/stock.ts packages/shared/src/index.ts packages/shared/test/stock.test.ts
git commit -m "feat: add shared stock status helper"
```

---

### Task 2: `GET /api/products` (pagination only)

**Files:**
- Create: `apps/api/src/repositories/product-repository.ts`
- Create: `apps/api/src/services/product-service.ts`
- Create: `apps/api/src/routes/products.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/openapi.test.ts` (the `implementation status` describe block, lines ~407-430)
- Test: `apps/api/test/products.test.ts`

**Interfaces:**
- Produces (repository): `interface ProductRecord { id; title; description; category: string /* slug */; price; stock; brand; sku; weight; createdAt: string; updatedAt: string }`; `createProductRepository(db: Db)` returning `{ list({ limit, offset }): { rows: ProductRecord[]; total: number } }`; `type ProductRepository`.
- Produces (service): `toProduct(record: ProductRecord): Product`; `createProductService(repository: ProductRepository)` returning `{ list({ page, pageSize }): { data: Product[]; meta: PageMeta } }`; `type ProductService`.
- Produces (route): `productRoutes(service: ProductService): Hono` with `GET /`.
- Consumes: `Db` from `src/db/client.ts`; `products`, `categories` from `src/db/schema.ts`; `listQuerySchema`, `Product`, `PageMeta` from `@catalog/shared`; test helpers `createTestDb`, `loadSeedData`, `seedDatabase`.

- [ ] **Step 1: Write the failing integration tests**

Create `apps/api/test/products.test.ts`:

```ts
import {
  productSchema,
  type ErrorResponse,
  type ListResponse,
  type Product,
} from '@catalog/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadSeedData, seedDatabase } from '../src/db/seed.js';
import { createTestDb, type TestDb } from './helpers.js';

const seed = loadSeedData();
const seededIds = seed.map((product) => product.id).sort((a, b) => a - b);

async function getList(app: ReturnType<typeof createApp>, query = '') {
  const res = await app.request(`/api/products${query}`);
  return { res, body: (await res.json()) as ListResponse<Product> };
}

async function getError(app: ReturnType<typeof createApp>, query: string) {
  const res = await app.request(`/api/products${query}`);
  return { res, body: (await res.json()) as ErrorResponse };
}

describe('GET /api/products', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    // The paging assertions below assume the seed is larger than one default page.
    expect(seed.length).toBeGreaterThan(30);
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
    app = createApp({ db: testDb.db });
  });
  afterAll(() => testDb.cleanup());

  it('defaults to a page size of 30 and reports the paging meta', async () => {
    const { res, body } = await getList(app);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(body.data).toHaveLength(30);
    expect(body.meta).toEqual({
      page: 1,
      pageSize: 30,
      total: seed.length,
      totalPages: Math.ceil(seed.length / 30),
    });
  });

  it('returns the remainder on the last page, ordered by id', async () => {
    const { body } = await getList(app, '?page=2');

    expect(body.data.map((product) => product.id)).toEqual(seededIds.slice(30));
    expect(body.meta.page).toBe(2);
    expect(body.meta.total).toBe(seed.length);
  });

  it('orders the first page by id ascending', async () => {
    const { body } = await getList(app);

    expect(body.data.map((product) => product.id)).toEqual(seededIds.slice(0, 30));
  });

  it('honours a custom pageSize and computes totalPages from it', async () => {
    const { body } = await getList(app, '?pageSize=10');

    expect(body.data).toHaveLength(10);
    expect(body.meta).toMatchObject({
      pageSize: 10,
      total: seed.length,
      totalPages: Math.ceil(seed.length / 10),
    });
  });

  it('returns an empty page, not an error, when the page is past the end', async () => {
    const { res, body } = await getList(app, '?page=99');

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta).toMatchObject({ page: 99, total: seed.length });
  });

  it('serialises each product to the wire shape: category slug, nested meta, no surrogate id', async () => {
    const { body } = await getList(app);
    const first = body.data[0];
    const expected = seed.find((product) => product.id === 1);

    expect(first).toEqual(expected);
    for (const item of body.data) {
      expect(productSchema.safeParse(item).success).toBe(true);
      expect(item).not.toHaveProperty('categoryId');
      expect(item).not.toHaveProperty('createdAt');
      expect(item).not.toHaveProperty('updatedAt');
    }
  });

  it('rejects a pageSize above 100 with a VALIDATION_ERROR naming pageSize', async () => {
    const { res, body } = await getError(app, '?pageSize=101');

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toContainEqual({ path: 'pageSize', message: 'must be <= 100' });
  });

  it('rejects page 0 with a VALIDATION_ERROR naming page', async () => {
    const { res, body } = await getError(app, '?page=0');

    expect(res.status).toBe(400);
    expect(body.error.details).toContainEqual({ path: 'page', message: 'must be >= 1' });
  });

  it('rejects a sort field outside the whitelist', async () => {
    const { res, body } = await getError(app, '?sort=bogus');

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.map((detail) => detail.path)).toContain('sort');
  });
});

describe('GET /api/products on an empty catalog', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    testDb = createTestDb();
    app = createApp({ db: testDb.db });
  });
  afterAll(() => testDb.cleanup());

  it('returns no rows and a zero total', async () => {
    const { res, body } = await getList(app);

    expect(res.status).toBe(200);
    expect(body).toEqual({
      data: [],
      meta: { page: 1, pageSize: 30, total: 0, totalPages: 0 },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/api/test/products.test.ts`
Expected: FAIL — every test in `GET /api/products` gets `404` (`NOT_FOUND`, route not registered), so `expect(res.status).toBe(200)` and the `data` assertions fail. The 400 tests also fail (they get 404, not 400).

- [ ] **Step 3: Write the repository**

Create `apps/api/src/repositories/product-repository.ts`:

```ts
import { asc, count, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { categories, products } from '../db/schema.js';

/** A stored product with its category resolved to the slug. Timestamps are still flat columns. */
export interface ProductRecord {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  brand: string;
  sku: string;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPage {
  rows: ProductRecord[];
  total: number;
}

export function createProductRepository(db: Db) {
  return {
    /** One page of products in a stable order (by id), plus the total row count. */
    list({ limit, offset }: { limit: number; offset: number }): ProductPage {
      const rows = db
        .select({
          id: products.id,
          title: products.title,
          description: products.description,
          category: categories.slug,
          price: products.price,
          stock: products.stock,
          brand: products.brand,
          sku: products.sku,
          weight: products.weight,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .orderBy(asc(products.id))
        .limit(limit)
        .offset(offset)
        .all();

      const total = db.select({ total: count() }).from(products).get()?.total ?? 0;

      return { rows, total };
    },
  };
}

export type ProductRepository = ReturnType<typeof createProductRepository>;
```

- [ ] **Step 4: Write the service**

Create `apps/api/src/services/product-service.ts`:

```ts
import type { ListQuery, PageMeta, Product } from '@catalog/shared';
import type { ProductRecord, ProductRepository } from '../repositories/product-repository.js';

/** Re-nests the flat timestamp columns as `meta`, the shape the brief's payload uses. */
export function toProduct(record: ProductRecord): Product {
  const { createdAt, updatedAt, ...fields } = record;
  return { ...fields, meta: { createdAt, updatedAt } };
}

export function createProductService(repository: ProductRepository) {
  return {
    list({ page, pageSize }: Pick<ListQuery, 'page' | 'pageSize'>): {
      data: Product[];
      meta: PageMeta;
    } {
      const { rows, total } = repository.list({ limit: pageSize, offset: (page - 1) * pageSize });

      return {
        data: rows.map(toProduct),
        meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    },
  };
}

export type ProductService = ReturnType<typeof createProductService>;
```

- [ ] **Step 5: Write the route and wire it into the app**

Create `apps/api/src/routes/products.ts`:

```ts
import { listQuerySchema } from '@catalog/shared';
import { Hono } from 'hono';
import type { ProductService } from '../services/product-service.js';

export function productRoutes(service: ProductService) {
  const routes = new Hono();

  // A ZodError from `parse` is turned into `400 VALIDATION_ERROR` by the error handler.
  // `q`, `category` and `sort` are validated here but only applied from B-08.
  routes.get('/', (c) => c.json(service.list(listQuerySchema.parse(c.req.query()))));

  return routes;
}
```

Replace `apps/api/src/app.ts` with:

```ts
import { Hono } from 'hono';
import type { Db } from './db/client.js';
import { handleError, handleNotFound } from './middleware/error-handler.js';
import { registerDocs } from './openapi/docs.js';
import { createProductRepository } from './repositories/product-repository.js';
import { productRoutes } from './routes/products.js';
import { createProductService } from './services/product-service.js';

export interface AppDeps {
  db: Db;
}

/**
 * Builds the API. Taking the database as a dependency lets tests run the real
 * app against a throwaway SQLite file with `app.request()` and no open port.
 * Each resource is composed here as repository -> service -> routes.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.onError(handleError);
  app.notFound(handleNotFound);
  registerDocs(app);

  const products = createProductService(createProductRepository(deps.db));
  app.route('/api/products', productRoutes(products));

  return app;
}
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `pnpm exec vitest run apps/api/test/products.test.ts`
Expected: PASS, 10 tests.

If the 400 tests fail because the error handler is not applied to the mounted sub-app (the response is a 500), that is a real finding: stop and report it instead of hand-writing an error response in the route.

- [ ] **Step 7: Run the whole API suite and see what the new route broke**

Run: `pnpm exec vitest run apps/api`
Expected: `openapi.test.ts` fails in two places (`implementation status` describe): "marks every operation as not implemented while no route exists" (now `GET /api/products` is implemented) and possibly "flips an operation on…" (it registers a duplicate `GET /api/products`). The documentation-coverage test `describes every route the real app registers` must still PASS — if it fails, the route path registered by `app.route('/api/products', …)` does not normalise to `GET /api/products`; report that.

- [ ] **Step 8: Update the OpenAPI implementation-status tests**

In `apps/api/test/openapi.test.ts`, add this constant directly after `EXPECTED_STATUSES` (after line 54):

```ts
/** Operations whose route exists in the real app. Add each one here as its backlog item lands. */
const IMPLEMENTED_OPERATIONS = new Set(['GET /api/products']);
```

Replace the whole `describe('implementation status', …)` block (lines ~407-430) with:

```ts
describe('implementation status', () => {
  it('marks an operation as not implemented until its route exists', async () => {
    const doc = await fetchDoc(newApp());

    for (const [key, operation] of operations(doc)) {
      const implemented = IMPLEMENTED_OPERATIONS.has(key);
      expect(operation['x-implemented'], key).toBe(implemented);
      if (implemented) {
        expect(operation.description, key).not.toMatch(/Not implemented yet/);
      } else {
        expect(operation.description, key).toMatch(/^\*\*Not implemented yet\.\*\*/);
      }
    }
  });

  it('flips an operation on as soon as its route is registered, and only that one', async () => {
    const app = newApp();
    app.get('/api/products/:id', (c) => c.json({ data: null }));
    app.get('/api/categories', (c) => c.json({ data: [] }));

    const ops = operations(await fetchDoc(app));

    expect(ops.get('GET /api/products/{id}')?.['x-implemented']).toBe(true);
    expect(ops.get('GET /api/products/{id}')?.description).not.toMatch(/Not implemented yet/);
    expect(ops.get('GET /api/categories')?.['x-implemented']).toBe(true);
    expect(ops.get('POST /api/products')?.['x-implemented']).toBe(false);
    expect(ops.get('DELETE /api/products/{id}')?.['x-implemented']).toBe(false);
  });
});
```

- [ ] **Step 9: Run the API suite, lint and typecheck**

Run: `pnpm exec vitest run apps/api && pnpm lint && pnpm typecheck`
Expected: all API tests pass (openapi.test.ts included); lint and typecheck exit 0. If `pnpm lint` reports a layering violation, fix the import — do not disable the rule.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "feat: list products with pagination"
```

---

### Task 3: Vitest projects, so web runes tests compile

**Files:**
- Create: `vitest.config.ts`
- Create: `apps/web/vitest.config.ts`
- Modify: `apps/web/tsconfig.json`

**Interfaces:**
- Produces: `pnpm test` still runs every existing test (same total), and a `web` Vitest project that compiles `*.svelte.ts` (runes). Task 4's store test relies on this.

**Why:** the repo has no Vitest config, so `pnpm test` runs from the root with defaults. Default Vitest does not run the Svelte compiler, so `$state` in `catalog.svelte.ts` would throw `$state is not defined`. Only the web package should get the Svelte plugin.

- [ ] **Step 1: Create the root config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // One project per workspace package. `apps/web` has its own config (Svelte plugin).
    projects: ['apps/api', 'apps/web', 'packages/shared'],
  },
});
```

- [ ] **Step 2: Create the web config**

Create `apps/web/vitest.config.ts`:

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The Svelte plugin compiles runes (`$state`, ...) in `*.svelte.ts` modules under test.
  plugins: [svelte()],
  test: { name: 'web' },
});
```

Modify `apps/web/tsconfig.json`: change the `include` line to

```json
  "include": ["src/**/*.ts", "src/**/*.svelte", "test/**/*.ts", "vite.config.ts", "vitest.config.ts"]
```

- [ ] **Step 3: Verify nothing was lost**

Run: `pnpm test`
Expected: PASS with the baseline **plus Task 1 and Task 2's additions**: 13 test files (11 + `stock.test.ts` + `products.test.ts`) and 167 tests (153 + 4 + 10). Compare against those numbers, not the original 153.

If a suite that passed before now fails (typical cause: a test that assumed the working directory was the repo root, now that each project's root is its own directory), fix that test's path handling rather than dropping the project config, and report what you changed. If `projects` is rejected with a config error, read the installed Vitest 5 docs for `projects` (in `node_modules/vitest`) and adapt; do not fall back to a flat config without the Svelte plugin.

- [ ] **Step 4: Verify the web project exists and typechecks**

Run: `pnpm exec vitest run --project web && pnpm typecheck`
Expected: the `web` project runs `api.test.ts` (the existing web test) and passes; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts apps/web/vitest.config.ts apps/web/tsconfig.json
git commit -m "chore: run tests as vitest projects with the svelte plugin for web"
```

---

### Task 4: Catalog store

**Files:**
- Create: `apps/web/src/lib/stores/catalog.svelte.ts`
- Test: `apps/web/test/catalog.test.ts`

**Interfaces:**
- Consumes: `api.list<T>(path, { query, signal }): Promise<ListResponse<T>>` and `ApiError` from `apps/web/src/lib/api.ts` (`new ApiError(status, code, message, details?)`; `NETWORK_ERROR` code for an unreachable server); `Product`, `PageMeta`, `DEFAULT_PAGE_SIZE` from `@catalog/shared`.
- Produces: `type CatalogStatus = 'loading' | 'ready' | 'error'`; `interface CatalogParams { page: number; pageSize: number }`; `class CatalogStore` with reactive fields `params`, `status`, `products`, `meta: PageMeta | null`, `error: ApiError | null` and `load(): Promise<void>`; `const catalog = new CatalogStore()`. Task 5's `Dashboard` reads `catalog` and calls `catalog.load()`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/catalog.test.ts`:

```ts
import type { ListResponse, Product } from '@catalog/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogStore } from '../src/lib/stores/catalog.svelte.js';

function product(id: number): Product {
  return {
    id,
    title: `Product ${id}`,
    description: 'A thing',
    category: 'gadgets',
    price: 9.99,
    stock: 10,
    brand: 'Acme',
    sku: `SKU-${id}`,
    weight: 1,
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  };
}

function page(products: Product[], total = products.length): ListResponse<Product> {
  return {
    data: products,
    meta: { page: 1, pageSize: 30, total, totalPages: Math.ceil(total / 30) },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => vi.unstubAllGlobals());

describe('CatalogStore', () => {
  it('starts in the loading state with no data', () => {
    const store = new CatalogStore();

    expect(store.status).toBe('loading');
    expect(store.products).toEqual([]);
    expect(store.meta).toBeNull();
    expect(store.error).toBeNull();
  });

  it('requests the first page at the default page size and stores the result', async () => {
    const fetchMock = vi.fn(async (_url: string) => json(page([product(1), product(2)], 36)));
    vi.stubGlobal('fetch', fetchMock);
    const store = new CatalogStore();

    const loading = store.load();
    expect(store.status).toBe('loading');
    await loading;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products?page=1&pageSize=30');
    expect(store.status).toBe('ready');
    expect(store.products.map((item) => item.id)).toEqual([1, 2]);
    expect(store.meta).toEqual({ page: 1, pageSize: 30, total: 36, totalPages: 2 });
    expect(store.error).toBeNull();
  });

  it('is ready with no products for an empty catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(page([], 0))));
    const store = new CatalogStore();

    await store.load();

    expect(store.status).toBe('ready');
    expect(store.products).toEqual([]);
    expect(store.meta?.total).toBe(0);
  });

  it('surfaces the API error envelope as a typed error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500),
      ),
    );
    const store = new CatalogStore();

    await store.load();

    expect(store.status).toBe('error');
    expect(store.error?.code).toBe('INTERNAL_ERROR');
    expect(store.error?.status).toBe(500);
  });

  it('reports an unreachable server as NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const store = new CatalogStore();

    await store.load();

    expect(store.status).toBe('error');
    expect(store.error?.code).toBe('NETWORK_ERROR');
  });

  it('recovers on a retry and clears the error', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(page([product(1)])));
    vi.stubGlobal('fetch', fetchMock);
    const store = new CatalogStore();

    await store.load();
    expect(store.status).toBe('error');

    await store.load();
    expect(store.status).toBe('ready');
    expect(store.error).toBeNull();
    expect(store.products).toHaveLength(1);
  });

  it('ignores a response that a newer load has superseded', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    );
    const store = new CatalogStore();

    const older = store.load();
    const newer = store.load();
    second.resolve(json(page([product(2)])));
    await newer;
    first.resolve(json(page([product(1)])));
    await older;

    expect(store.status).toBe('ready');
    expect(store.products.map((item) => item.id)).toEqual([2]);
  });

  it('aborts the previous request when a new load starts', async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        signals.push(init?.signal);
        return json(page([product(1)]));
      }),
    );
    const store = new CatalogStore();

    const older = store.load();
    const newer = store.load();
    await Promise.all([older, newer]);

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --project web apps/web/test/catalog.test.ts`
Expected: FAIL — the import of `../src/lib/stores/catalog.svelte.js` cannot be resolved (file does not exist).

- [ ] **Step 3: Write the store**

Create `apps/web/src/lib/stores/catalog.svelte.ts`:

```ts
import { DEFAULT_PAGE_SIZE, type PageMeta, type Product } from '@catalog/shared';
import { api, ApiError } from '../api.js';

export type CatalogStatus = 'loading' | 'ready' | 'error';

/** Query state that drives the list. Search, sort and category join it in B-08. */
export interface CatalogParams {
  page: number;
  pageSize: number;
}

/** Query params and results for the product list. */
export class CatalogStore {
  params = $state<CatalogParams>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  status = $state<CatalogStatus>('loading');
  products = $state<Product[]>([]);
  meta = $state<PageMeta | null>(null);
  error = $state<ApiError | null>(null);

  #inFlight: AbortController | undefined;

  /** Fetches the list for the current params. A newer call supersedes an older one. */
  async load(): Promise<void> {
    this.#inFlight?.abort();
    const request = new AbortController();
    this.#inFlight = request;

    this.status = 'loading';
    this.error = null;

    try {
      const response = await api.list<Product>('/products', {
        query: { page: this.params.page, pageSize: this.params.pageSize },
        signal: request.signal,
      });
      if (request.signal.aborted) return;

      this.products = response.data;
      this.meta = response.meta;
      this.status = 'ready';
    } catch (cause) {
      // A superseded request is not a failure; the newer one owns the state.
      if (request.signal.aborted) return;

      this.error =
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
      this.status = 'error';
    }
  }
}

export const catalog = new CatalogStore();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --project web apps/web/test/catalog.test.ts`
Expected: PASS, 8 tests.

If Vitest fails with `$state is not defined` or a Svelte compile error, the `web` project is not using the Svelte plugin — recheck Task 3 (do not work around it by removing runes).

- [ ] **Step 5: Lint, typecheck, commit**

Run: `pnpm lint && pnpm typecheck`
Expected: both exit 0.

```bash
git add apps/web/src/lib/stores/catalog.svelte.ts apps/web/test/catalog.test.ts
git commit -m "feat: add the catalog store"
```

---

### Task 5: Dashboard, product table and app shell

**Files:**
- Create: `apps/web/src/components/ProductTable.svelte`
- Create: `apps/web/src/views/Dashboard.svelte`
- Modify: `apps/web/src/App.svelte`

**Interfaces:**
- Consumes: `catalog` (Task 4: `status`, `products`, `meta`, `error`, `load()`); `stockStatus`, `StockStatus`, `Product` from `@catalog/shared` (Task 1).
- Produces: `<ProductTable products={Product[]} />`; `<Dashboard />` (no props).

There is no component test in this task: the repo has no component-testing setup, the logic worth testing is in the store (Task 4) and the shared helper (Task 1), and the slice is verified end to end in the browser in Task 6. The gates here are `svelte-check`, lint and a production build.

- [ ] **Step 1: Write the product table**

Create `apps/web/src/components/ProductTable.svelte`:

```svelte
<script lang="ts">
  import { stockStatus, type Product, type StockStatus } from '@catalog/shared';

  let { products }: { products: Product[] } = $props();

  const badges: Record<StockStatus, { label: string; classes: string }> = {
    out: { label: 'Out of stock', classes: 'bg-red-100 text-red-800' },
    low: { label: 'Low stock', classes: 'bg-amber-100 text-amber-800' },
    in: { label: 'In stock', classes: 'bg-emerald-100 text-emerald-800' },
  };

  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
</script>

<div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
  <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
    <thead class="bg-slate-50 text-xs font-semibold tracking-wide text-slate-600 uppercase">
      <tr>
        <th scope="col" class="px-4 py-3">Product</th>
        <th scope="col" class="px-4 py-3">Brand</th>
        <th scope="col" class="px-4 py-3">Category</th>
        <th scope="col" class="px-4 py-3 text-right">Price</th>
        <th scope="col" class="px-4 py-3 text-right">Stock</th>
        <th scope="col" class="px-4 py-3">Status</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-100">
      {#each products as product (product.id)}
        {@const badge = badges[stockStatus(product.stock)]}
        <tr>
          <td class="px-4 py-3">
            <div class="font-medium text-slate-900">{product.title}</div>
            <div class="text-xs text-slate-500">{product.sku}</div>
          </td>
          <td class="px-4 py-3 text-slate-700">{product.brand}</td>
          <td class="px-4 py-3 text-slate-700">{product.category}</td>
          <td class="px-4 py-3 text-right text-slate-900 tabular-nums">
            {currency.format(product.price)}
          </td>
          <td class="px-4 py-3 text-right text-slate-900 tabular-nums">{product.stock}</td>
          <td class="px-4 py-3">
            <span
              class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {badge.classes}"
            >
              {badge.label}
            </span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

- [ ] **Step 2: Write the dashboard view**

Create `apps/web/src/views/Dashboard.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import ProductTable from '../components/ProductTable.svelte';
  import { catalog } from '../lib/stores/catalog.svelte.js';

  onMount(() => {
    void catalog.load();
  });
</script>

<section aria-labelledby="products-heading">
  <h2 id="products-heading" class="text-lg font-semibold text-slate-900">Products</h2>

  <div class="mt-4">
    {#if catalog.status === 'loading'}
      <p role="status" class="text-slate-600">Loading products…</p>
    {:else if catalog.status === 'error'}
      <div role="alert" class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p class="font-medium">Could not load products</p>
        <p class="mt-1 text-sm">{catalog.error?.message}</p>
        <button
          type="button"
          class="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
          onclick={() => catalog.load()}
        >
          Try again
        </button>
      </div>
    {:else if catalog.products.length === 0}
      <p class="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-600">
        No products yet.
      </p>
    {:else}
      <ProductTable products={catalog.products} />
      {#if catalog.meta}
        <p class="mt-3 text-sm text-slate-600">
          Showing {catalog.products.length} of {catalog.meta.total} products
        </p>
      {/if}
    {/if}
  </div>
</section>
```

- [ ] **Step 3: Render it from the app shell**

Replace `apps/web/src/App.svelte` with:

```svelte
<script lang="ts">
  import Dashboard from './views/Dashboard.svelte';
</script>

<main class="mx-auto max-w-6xl px-4 py-8">
  <h1 class="text-2xl font-semibold text-slate-900">Product Catalog</h1>
  <div class="mt-6">
    <Dashboard />
  </div>
</main>
```

- [ ] **Step 4: Typecheck, lint and build**

Run: `pnpm typecheck && pnpm lint && pnpm --filter @catalog/web build`
Expected: all exit 0. If Vite cannot resolve `'../lib/stores/catalog.svelte.js'` from a `.svelte` file (a `.js` specifier pointing at a `.ts` source), change only the two `.svelte` importers to the extensionless form `'../lib/stores/catalog.svelte'`, re-run, and note it. If lint reports formatting in the `.svelte` files, run `pnpm exec prettier --write apps/web/src` and re-run.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test`
Expected: PASS, 14 files and 175 tests (the Task 3 total of 13 files / 167 tests plus `catalog.test.ts` with 8 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat: render the product list on the dashboard"
```

---

### Task 6: Verify in the running app, update the docs, finish

**Files:**
- Modify: `docs/technical-decisions.md`
- Modify: `docs/backlog.md`

- [ ] **Step 1: Run the real slice**

Use the `run` skill (or the commands below). In one shell start the stack, in another drive it:

```bash
pnpm db:seed
pnpm dev
```

Expected: API on `http://localhost:3000`, Vite on `http://localhost:5173`. Then:

- `curl -s "http://localhost:3000/api/products" | head -c 400` -> starts with `{"data":[{"id":1,`, and `curl -s "http://localhost:3000/api/products?pageSize=101"` -> a `400` `VALIDATION_ERROR` body.
- Open `http://localhost:5173` with the Playwright browser tools: take a screenshot and confirm the table shows 30 rows, the footer reads "Showing 30 of 36 products", and the seeded zero-stock rows show a red "Out of stock" badge while 1-5 stock rows show an amber "Low stock" badge.
- Error state: stop the API process, click "Try again" (or reload), confirm the red "Could not load products" alert appears; restart the API and click "Try again" to confirm it recovers.
- `http://localhost:3000/api/docs` — `GET /api/products` is no longer flagged "Not implemented yet".

Stop both dev servers when done. If any expectation fails, fix it with a test first (superpowers:systematic-debugging), do not proceed.

- [ ] **Step 2: Update `docs/technical-decisions.md`**

Make three edits.

1. §4 "Storage vs. wire shape" — replace "re-nested by a serializer at the route boundary" with "re-nested by the product service (`toProduct` in `services/product-service.ts`; routes may not import row types, so the mapping cannot live at the route boundary)".

2. §5 "Product table" bullet — extend to: `- **Product table** - paginated rows with inline stock status; clicking a row opens the detail modal. Stock status is derived, not sent by the API: \`stockStatus()\` in \`packages/shared\` returns \`out\` at 0, \`low\` from 1 to \`LOW_STOCK_THRESHOLD\` (5, matching the seed), otherwise \`in\`.`

3. §6 — after the "**Unit tests:**" paragraph add: `**Test projects:** the root \`vitest.config.ts\` declares one Vitest project per workspace package. \`apps/web\` has its own \`vitest.config.ts\` with the Svelte plugin, so runes in \`*.svelte.ts\` modules (the catalog store) compile under test.`

- [ ] **Step 3: Update `docs/backlog.md`**

Under B-06 change `**Status:** Todo` to `**Status:** Done`, and append a line to B-06's API list:

`- Scope note: B-06 applies \`page\` and \`pageSize\` only, ordered by \`id\`. \`q\`, \`category\` and \`sort\` are validated by the shared schema but take effect in B-08.`

Under B-08's API list add: `- Replaces B-06's fixed \`id\` order and applies \`q\`, \`category\` and \`sort\` in the repository.`

- [ ] **Step 4: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass (14 files, 175 tests).

- [ ] **Step 5: Commit the docs**

```bash
git add docs/technical-decisions.md docs/backlog.md docs/superpowers/plans/2026-09-20-b-06-list-products.md
git commit -m "docs: record the list-products decisions and mark B-06 done"
```

- [ ] **Step 6: Ask for the AI.md entry, then open the PR**

B-06 is a completed vertical slice, so per `CLAUDE.md` stop and ask the user for their `AI.md` entry using the `ai-log` skill (`.claude/skills/ai-log/SKILL.md`). Never write an entry without the user's own input. After the entry is committed, push the branch and open a PR to `main`:

```bash
git push -u origin feat/b-06-list-products
gh pr create --base main --title "feat: list products (B-06)" --body "<summary of the slice and how it was verified>"
```

End the PR body with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
