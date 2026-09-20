# B-07 Product Detail and Create Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `GET /api/products/:id` and `POST /api/products`, plus a modal on the dashboard that shows a product's full record (opened by clicking a row) and hosts a "New product" form validated with the shared Zod schema.

**Architecture:** API stays `routes -> services -> repositories`. The repository gains `findById`, `findCategoryId`, `skuExists` and `insert`; the service owns the business rules (unknown category -> `400`, duplicate sku -> `409`, timestamps); routes parse with shared schemas. On the web, a runes-based `ProductDialogStore` owns what the modal shows (`closed | create | detail`) and how a create succeeds; `Modal` is a thin shell over the native `<dialog>` (which gives escape-to-close and a focus trap for free); one `ProductForm` validates with `createProductSchema` and maps server `details` back onto fields.

**Tech Stack:** TypeScript, Hono, Drizzle + better-sqlite3, Zod (`packages/shared`), Svelte 5 runes, Tailwind v4, Vitest, pnpm workspaces.

**Spec:** No separate spec file. Requirements: `docs/backlog.md` item B-07 (merged detail + create); contracts: `docs/technical-decisions.md` §3 (API), §4 (data model), §5 (SPA), §6 (tests). Style reference for a finished slice: `docs/superpowers/plans/2026-09-20-b-06-list-products.md`.

## Global Constraints

- Branch: `feat/b-07-product-detail-and-create`, created from `main`. Never commit to `main`. Do **not** open a PR and do **not** merge: stop after Task 7 and hand back for review (the maintainer merges locally with `--no-ff`).
- Commit messages: a single line with a Conventional Commits prefix (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`). No body, no footers, never a `Co-Authored-By` trailer. This project rule overrides any tool default that says otherwise.
- The pre-commit hook runs `pnpm audit` and needs network access. Do not use `--no-verify` unless offline.
- Layering is enforced by ESLint (`pnpm lint` fails on a violation): routes may not import `drizzle-orm`, `better-sqlite3`, `**/db/**` or `**/repositories/**`; services may not import `hono`, `drizzle-orm`, `**/db/**`, `**/routes/**` or `**/middleware/**`; repositories may not import `hono`, `**/errors`, `**/middleware/**`, `**/routes/**` or `**/services/**`. Repositories never throw HTTP errors; services throw `ValidationError` / `NotFoundError` / `ConflictError` from `apps/api/src/errors.ts`.
- Never duplicate the product contract: import `createProductSchema`, `Product`, `CreateProductInput`, `zodIssuesToDetails`, etc. from `@catalog/shared`. Do not add a `zod` dependency to `apps/api` or `apps/web`.
- Errors use the §3.3 envelope only through `middleware/error-handler.ts`; a route never hand-writes an error response.
- `id`, `meta.createdAt` and `meta.updatedAt` are server-owned: ignored if the client sends them (Zod's `z.object` already strips unknown keys).
- A product write never creates a category. An unknown slug is `400 VALIDATION_ERROR` with `details` naming `category`.
- `packages/shared` is consumed as source (`"exports": { ".": "./src/index.ts" }`); imports inside it use the `.js` suffix.
- TypeScript is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use `import type` for types). The web app is type-checked with `svelte-check` via `pnpm typecheck`.
- Prettier: single quotes, semicolons, trailing commas, print width 100. Run `pnpm exec prettier --write <files>` if `pnpm lint` reports formatting.
- Scope boundary: do **not** implement edit, delete, `PATCH`, `DELETE`, or the categories endpoints (B-10, B-11). The Edit and Delete buttons in the detail modal render **disabled**. The form's category field is a plain text input until B-11 supplies a category list.
- Standing rule (backlog B-16): every new route needs its operation in `apps/api/src/openapi/document.ts`. Both new operations are already described there; Task 3 checks the `409` example.
- The web app has no component-test setup (Vitest runs in the Node environment, `*.svelte` files are not tested). Logic that needs tests lives in plain `.ts` / `.svelte.ts` modules; components are verified by the manual browser check in Task 6. Do not add jsdom or a component-testing library.
- `CLAUDE.md`: after this slice is finished, **stop and ask the user for the `AI.md` entry** (use the `ai-log` skill). Never write an `AI.md` entry yourself.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/shared/src/product.ts` | Modify | add `productIdParamSchema` (`:id` path param) |
| `packages/shared/test/product-id.test.ts` | Create | coercion and rejection cases for the id param |
| `apps/api/src/repositories/product-repository.ts` | Modify | share the column selection; add `findById`, `findCategoryId`, `skuExists`, `insert` |
| `apps/api/src/services/product-service.ts` | Modify | add `get(id)` and `create(input)`; injectable clock |
| `apps/api/src/routes/json-body.ts` | Create | `readJsonBody(c)`: malformed JSON becomes a `400`, not a `500` |
| `apps/api/src/routes/products.ts` | Modify | `GET /:id` and `POST /` |
| `apps/api/test/product-detail.test.ts` | Create | integration tests for `GET /:id` |
| `apps/api/test/product-create.test.ts` | Create | integration tests for `POST /` |
| `apps/web/src/lib/product-form.ts` | Create | form values <-> `CreateProductInput`, client validation, server `details` -> field errors |
| `apps/web/test/product-form.test.ts` | Create | unit tests for the above |
| `apps/web/src/lib/stores/product-dialog.svelte.ts` | Create | `ProductDialogStore`: modal view state, detail fetch, create flow |
| `apps/web/test/product-dialog.test.ts` | Create | store tests with a stubbed `fetch` |
| `apps/web/src/components/Modal.svelte` | Create | native `<dialog>` shell: title, close button, escape, backdrop click |
| `apps/web/src/components/ProductForm.svelte` | Create | the one product form (create now, edit in B-10) |
| `apps/web/src/views/ProductDetail.svelte` | Create | read-only full record with disabled Edit / Delete |
| `apps/web/src/views/ProductDialog.svelte` | Create | picks Modal content from the store's view |
| `apps/web/src/components/ProductTable.svelte` | Modify | `onselect` prop; clickable, keyboard-reachable rows |
| `apps/web/src/views/Dashboard.svelte` | Modify | "New product" button; mount `ProductDialog`; pass `onselect` |
| `docs/technical-decisions.md`, `docs/backlog.md` | Modify | record the decisions below; mark B-07 Done |

---

### Task 1: Shared `:id` path-param schema

**Files:**
- Modify: `packages/shared/src/product.ts` (append after `patchProductSchema`)
- Test: `packages/shared/test/product-id.test.ts`

**Interfaces:**
- Consumes: `zod` (already a dependency of `packages/shared`).
- Produces: `productIdParamSchema: z.ZodObject<{ id: number }>` exported from `@catalog/shared` (via the existing `export * from './product.js'`). Parsing `{ id: '7' }` yields `{ id: 7 }`. Failures have path `id` and message `must be an integer` (non-numeric or fractional) or `must be >= 1` (zero, negative). These match the example already in `openapi/document.ts` (`validationError('id', 'must be an integer')`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/test/product-id.test.ts
import { describe, expect, it } from 'vitest';
import { productIdParamSchema } from '../src/index.js';

function failure(id: string) {
  const result = productIdParamSchema.safeParse({ id });
  if (result.success) throw new Error(`expected "${id}" to be rejected`);
  return result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

describe('productIdParamSchema', () => {
  it('coerces a numeric string to a number', () => {
    expect(productIdParamSchema.parse({ id: '7' })).toEqual({ id: 7 });
  });

  it.each(['abc', '1.5', 'NaN'])('rejects %s as not an integer', (id) => {
    expect(failure(id)).toEqual([{ path: 'id', message: 'must be an integer' }]);
  });

  it.each(['0', '-3'])('rejects %s as below 1', (id) => {
    expect(failure(id)).toEqual([{ path: 'id', message: 'must be >= 1' }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/shared/test/product-id.test.ts`
Expected: FAIL (`productIdParamSchema` is not exported).

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/product.ts — after patchProductSchema
/** `:id` path parameter of the single-product routes. Arrives as a string and is coerced. */
export const productIdParamSchema = z.object({
  id: z.coerce
    .number({ error: 'must be an integer' })
    .int('must be an integer')
    .min(1, 'must be >= 1'),
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run packages/shared/test/product-id.test.ts`
Expected: PASS. If `abc` reports a different message, the `{ error: ... }` option on `z.coerce.number` is what controls the NaN case; keep it.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/product.ts packages/shared/test/product-id.test.ts
git commit -m "feat: add the product id path-param schema to the shared package"
```

---

### Task 2: `GET /api/products/:id`

**Files:**
- Modify: `apps/api/src/repositories/product-repository.ts`
- Modify: `apps/api/src/services/product-service.ts`
- Modify: `apps/api/src/routes/products.ts`
- Test: `apps/api/test/product-detail.test.ts`

**Interfaces:**
- Consumes: `productIdParamSchema` (Task 1); `NotFoundError` from `apps/api/src/errors.ts` (`new NotFoundError(message)`).
- Produces:
  - `ProductRepository.findById(id: number): ProductRecord | undefined`
  - `ProductService.get(id: number): Product` (throws `NotFoundError('Product <id> not found')`)
  - Route `GET /api/products/:id` -> `200 { "data": Product }`, `404 NOT_FOUND`, `400 VALIDATION_ERROR` (details path `id`).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/test/product-detail.test.ts
import {
  productSchema,
  type ErrorResponse,
  type ItemResponse,
  type Product,
} from '@catalog/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadSeedData, seedDatabase } from '../src/db/seed.js';
import { createTestDb, type TestDb } from './helpers.js';

const seed = loadSeedData();

describe('GET /api/products/:id', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
    app = createApp({ db: testDb.db });
  });
  afterAll(() => testDb.cleanup());

  it('returns the full product in the single-resource envelope', async () => {
    const expected = seed[0]!;
    const res = await app.request(`/api/products/${expected.id}`);
    const body = (await res.json()) as ItemResponse<Product>;

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(Object.keys(body)).toEqual(['data']);
    expect(productSchema.parse(body.data)).toEqual(expected);
  });

  it('answers 404 NOT_FOUND in the error envelope for an unknown id', async () => {
    const res = await app.request('/api/products/999999');
    const body = (await res.json()) as ErrorResponse;

    expect(res.status).toBe(404);
    expect(body.error).toEqual({ code: 'NOT_FOUND', message: 'Product 999999 not found' });
  });

  it.each(['abc', '1.5', '0', '-1'])('answers 400 VALIDATION_ERROR for the id "%s"', async (id) => {
    const res = await app.request(`/api/products/${id}`);
    const body = (await res.json()) as ErrorResponse;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.map((detail) => detail.path)).toEqual(['id']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run apps/api/test/product-detail.test.ts`
Expected: FAIL (`GET /:id` falls through to the `404 Route not found` handler, so the first test gets `404` instead of `200`).

- [ ] **Step 3: Implement the repository method**

In `product-repository.ts`, extract the column selection that `list` currently inlines into a module-level constant, use it in `list` (behaviour unchanged), and add `findById`:

```ts
const productColumns = {
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
};

// inside createProductRepository's returned object:
/** One product with its category slug resolved, or `undefined` when the id does not exist. */
findById(id: number): ProductRecord | undefined {
  return db
    .select(productColumns)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .get();
},
```

and change `list`'s `.select({...})` to `.select(productColumns)`.

- [ ] **Step 4: Implement the service method**

```ts
// product-service.ts
import { NotFoundError } from '../errors.js';

// inside createProductService's returned object:
get(id: number): Product {
  const record = repository.findById(id);
  if (!record) throw new NotFoundError(`Product ${id} not found`);
  return toProduct(record);
},
```

- [ ] **Step 5: Implement the route**

```ts
// routes/products.ts
import { listQuerySchema, productIdParamSchema } from '@catalog/shared';

routes.get('/:id', (c) => {
  const { id } = productIdParamSchema.parse(c.req.param());
  return c.json({ data: service.get(id) });
});
```

- [ ] **Step 6: Run to verify it passes, plus the existing API suite**

Run: `pnpm exec vitest run apps/api`
Expected: PASS (the B-06/B-08 list tests and the OpenAPI tests still pass; the refactor of `list` must not change behaviour).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src apps/api/test/product-detail.test.ts
git commit -m "feat: add GET /api/products/:id"
```

---

### Task 3: `POST /api/products`

**Files:**
- Modify: `apps/api/src/repositories/product-repository.ts`
- Modify: `apps/api/src/services/product-service.ts`
- Create: `apps/api/src/routes/json-body.ts`
- Modify: `apps/api/src/routes/products.ts`
- Modify (only if needed): `apps/api/src/openapi/document.ts`
- Test: `apps/api/test/product-create.test.ts`

**Interfaces:**
- Consumes: `createProductSchema`, `CreateProductInput` (shared, existing); `ValidationError(message, details)` and `ConflictError(message, details?)` from `apps/api/src/errors.ts`; `ProductService.get` and `toProduct` (Task 2).
- Produces:
  - `NewProduct` (exported from the repository): `{ title: string; description: string; categoryId: number; price: number; stock: number; brand: string; sku: string; weight: number; createdAt: string; updatedAt: string }`
  - `ProductRepository.findCategoryId(slug: string): number | undefined`
  - `ProductRepository.skuExists(sku: string): boolean`
  - `ProductRepository.insert(values: NewProduct): number` (returns the new id)
  - `createProductService(repository, now?: () => Date)`; `ProductService.create(input: CreateProductInput): Product`
  - `readJsonBody(c: Context): Promise<unknown>` (throws `ValidationError` with details `[{ path: '', message: 'must be valid JSON' }]`)
  - Route `POST /api/products` -> `201 { "data": Product }`; `400 VALIDATION_ERROR`; `409 CONFLICT` whose `details` is `[{ path: 'sku', message: 'is already in use' }]`, so the form can put the message on the sku field.

**Rules encoded here (verify against the tests):**
- Order of checks: shared schema (`400`) -> category exists (`400`, details path `category`) -> sku unique (`409`).
- Both timestamps are set to the same `new Date().toISOString()`.
- The duplicate-sku pre-check plus insert are race-free because `better-sqlite3` is synchronous (no other request runs between them); the unique index on `sku` remains the backstop.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/test/product-create.test.ts
import {
  productSchema,
  type ErrorResponse,
  type ItemResponse,
  type ListResponse,
  type Product,
} from '@catalog/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { categories } from '../src/db/schema.js';
import { loadSeedData, seedDatabase } from '../src/db/seed.js';
import { createTestDb, type TestDb } from './helpers.js';

const seed = loadSeedData();
const highestSeededId = Math.max(...seed.map((product) => product.id));
const seededCategoryCount = new Set(seed.map((product) => product.category)).size;

let skuCounter = 0;
function newProduct(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Rocket Skates',
    description: 'Blast off on any flat surface.',
    category: seed[0]!.category,
    price: 19.99,
    stock: 3,
    brand: 'ACME',
    sku: `TEST-${++skuCounter}`,
    weight: 2.5,
    ...overrides,
  };
}

describe('POST /api/products', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  const post = (body: unknown) =>
    app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const total = async () =>
    ((await (await app.request('/api/products')).json()) as ListResponse<Product>).meta.total;
  const errorOf = async (res: Response) => ((await res.json()) as ErrorResponse).error;

  beforeEach(() => {
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
    app = createApp({ db: testDb.db });
  });
  afterEach(() => testDb.cleanup());

  it('creates the product and answers 201 with the stored record', async () => {
    const before = Date.now();
    const input = newProduct();
    const res = await post(input);
    const { data } = (await res.json()) as ItemResponse<Product>;

    expect(res.status).toBe(201);
    expect(productSchema.parse(data)).toEqual({ ...input, id: data.id, meta: data.meta });
    expect(data.id).toBeGreaterThan(highestSeededId);
    expect(data.meta.createdAt).toBe(data.meta.updatedAt);
    expect(Date.parse(data.meta.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(data.meta.createdAt)).toBeLessThanOrEqual(Date.now());
  });

  it('persists the product so it can be read back and appears in the list total', async () => {
    const created = ((await (await post(newProduct())).json()) as ItemResponse<Product>).data;

    const read = await app.request(`/api/products/${created.id}`);
    expect(((await read.json()) as ItemResponse<Product>).data).toEqual(created);
    expect(await total()).toBe(seed.length + 1);
  });

  it('ignores a client-sent id and meta', async () => {
    const res = await post(
      newProduct({
        id: 1,
        meta: { createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z' },
      }),
    );
    const { data } = (await res.json()) as ItemResponse<Product>;

    expect(res.status).toBe(201);
    expect(data.id).not.toBe(1);
    expect(data.meta.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('trims title, brand and sku', async () => {
    const res = await post(
      newProduct({ title: '  Rocket Skates  ', brand: ' ACME ', sku: '  TRIM-1  ' }),
    );
    const { data } = (await res.json()) as ItemResponse<Product>;

    expect(data).toMatchObject({ title: 'Rocket Skates', brand: 'ACME', sku: 'TRIM-1' });
  });

  it('rejects a negative price with details naming price', async () => {
    const res = await post(newProduct({ price: -1 }));
    const error = await errorOf(res);

    expect(res.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([{ path: 'price', message: 'must be >= 0' }]);
    expect(await total()).toBe(seed.length);
  });

  it('lists every failing field when the body is empty', async () => {
    const res = await post({});
    const error = await errorOf(res);

    expect(res.status).toBe(400);
    expect(error.details?.map((detail) => detail.path).sort()).toEqual([
      'brand',
      'category',
      'description',
      'price',
      'sku',
      'stock',
      'title',
      'weight',
    ]);
  });

  it('rejects an unknown category naming category, and never creates it', async () => {
    const res = await post(newProduct({ category: 'ghost-town' }));
    const error = await errorOf(res);

    expect(res.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.map((detail) => detail.path)).toEqual(['category']);
    expect(testDb.db.select().from(categories).all()).toHaveLength(seededCategoryCount);
    expect(await total()).toBe(seed.length);
  });

  it('answers 409 CONFLICT with details naming sku for a duplicate sku', async () => {
    const res = await post(newProduct({ sku: seed[0]!.sku }));
    const error = await errorOf(res);

    expect(res.status).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.details).toEqual([{ path: 'sku', message: 'is already in use' }]);
    expect(await total()).toBe(seed.length);
  });

  it('answers 409 when the same new sku is posted twice', async () => {
    const input = newProduct();

    expect((await post(input)).status).toBe(201);
    expect((await post(input)).status).toBe(409);
    expect(await total()).toBe(seed.length + 1);
  });

  it('answers 400 VALIDATION_ERROR for a body that is not JSON', async () => {
    const res = await post('{ not json');
    const error = await errorOf(res);

    expect(res.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([{ path: '', message: 'must be valid JSON' }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run apps/api/test/product-create.test.ts`
Expected: FAIL (`POST /api/products` returns `404 Route not found`).

- [ ] **Step 3: Implement the repository methods**

```ts
// product-repository.ts
export interface NewProduct {
  title: string;
  description: string;
  categoryId: number;
  price: number;
  stock: number;
  brand: string;
  sku: string;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

// inside createProductRepository's returned object:
/** The id of the category with this slug, or `undefined` when there is none. */
findCategoryId(slug: string): number | undefined {
  return db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).get()?.id;
},

skuExists(sku: string): boolean {
  return db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).get() !== undefined;
},

/** Inserts the row and returns its new id. */
insert(values: NewProduct): number {
  return db.insert(products).values(values).returning({ id: products.id }).get().id;
},
```

- [ ] **Step 4: Implement the service method**

```ts
// product-service.ts
import { type CreateProductInput /* alongside the existing imports */ } from '@catalog/shared';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';

export function createProductService(repository: ProductRepository, now: () => Date = () => new Date()) {
  const get = (id: number): Product => {
    const record = repository.findById(id);
    if (!record) throw new NotFoundError(`Product ${id} not found`);
    return toProduct(record);
  };

  return {
    list(/* unchanged */) { /* ... */ },

    get,

    create(input: CreateProductInput): Product {
      const categoryId = repository.findCategoryId(input.category);
      if (categoryId === undefined) {
        throw new ValidationError('Invalid product payload', [
          { path: 'category', message: `"${input.category}" is not an existing category` },
        ]);
      }
      if (repository.skuExists(input.sku)) {
        throw new ConflictError(`A product with SKU "${input.sku}" already exists`, [
          { path: 'sku', message: 'is already in use' },
        ]);
      }

      const timestamp = now().toISOString();
      const id = repository.insert({
        title: input.title,
        description: input.description,
        categoryId,
        price: input.price,
        stock: input.stock,
        brand: input.brand,
        sku: input.sku,
        weight: input.weight,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return get(id);
    },
  };
}
```

(Move the `get` from Task 2 into the local `const get` shown above so `create` can reuse it without `this`; keep `get` in the returned object.)

- [ ] **Step 5: Implement `readJsonBody` and the route**

```ts
// apps/api/src/routes/json-body.ts
import type { Context } from 'hono';
import { ValidationError } from '../errors.js';

/** Parses the request body as JSON; malformed JSON is the client's mistake (400), not a server error. */
export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ValidationError('Invalid request', [{ path: '', message: 'must be valid JSON' }]);
  }
}
```

```ts
// routes/products.ts
import { createProductSchema, listQuerySchema, productIdParamSchema } from '@catalog/shared';
import { readJsonBody } from './json-body.js';

routes.post('/', async (c) => {
  const input = createProductSchema.parse(await readJsonBody(c));
  return c.json({ data: service.create(input) }, 201);
});
```

- [ ] **Step 6: Check the OpenAPI `409` example**

Open `apps/api/src/openapi/document.ts`, find the `409` example used by `POST /api/products`. If it does not show `details: [{ path: 'sku', message: 'is already in use' }]`, add it (the existing OpenAPI tests validate examples against the shared error shape). Do not otherwise change the document; both operations already exist there.

- [ ] **Step 7: Run to verify everything passes**

Run: `pnpm exec vitest run apps/api && pnpm typecheck && pnpm lint`
Expected: PASS, including the "route missing from the OpenAPI document" test.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src apps/api/test/product-create.test.ts
git commit -m "feat: add POST /api/products"
```

---

### Task 4: Web form logic (pure module)

**Files:**
- Create: `apps/web/src/lib/product-form.ts`
- Test: `apps/web/test/product-form.test.ts`

**Interfaces:**
- Consumes: `createProductSchema`, `zodIssuesToDetails`, `CreateProductInput`, `ErrorDetail` from `@catalog/shared`.
- Produces (all exported from `product-form.ts`):
  - `FORM_FIELDS = ['title','description','category','brand','sku','price','stock','weight'] as const`; `type FormField`
  - `type ProductFormValues = Record<FormField, string>` and `const EMPTY_VALUES: ProductFormValues` (all `''`)
  - `type FieldErrors = Partial<Record<FormField, string>>`
  - `validateProductForm(values: ProductFormValues): { ok: true; input: CreateProductInput } | { ok: false; errors: FieldErrors }`
  - `detailsToFieldErrors(details: ErrorDetail[]): { fields: FieldErrors; unmatched: ErrorDetail[] }` — a detail whose `path` is a form field goes to `fields` (first message per field wins); anything else (e.g. path `''`) goes to `unmatched`.

**Rules:** numeric fields (`price`, `stock`, `weight`) and `category` that are blank after trimming report `'is required'`; a numeric field that is not a finite number reports `'must be a number'`; everything else is the shared schema's message, so it matches the API's.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/product-form.test.ts
import { describe, expect, it } from 'vitest';
import {
  detailsToFieldErrors,
  EMPTY_VALUES,
  validateProductForm,
  type ProductFormValues,
} from '../src/lib/product-form.js';

const valid: ProductFormValues = {
  title: '  Rocket Skates ',
  description: 'Blast off.',
  category: 'automotive',
  brand: 'ACME',
  sku: 'ACM-1',
  price: '19.99',
  stock: '3',
  weight: '2.5',
};

function errorsFor(overrides: Partial<ProductFormValues>) {
  const result = validateProductForm({ ...valid, ...overrides });
  if (result.ok) throw new Error('expected the form to be invalid');
  return result.errors;
}

describe('validateProductForm', () => {
  it('turns valid values into a typed, trimmed input', () => {
    expect(validateProductForm(valid)).toEqual({
      ok: true,
      input: {
        title: 'Rocket Skates',
        description: 'Blast off.',
        category: 'automotive',
        brand: 'ACME',
        sku: 'ACM-1',
        price: 19.99,
        stock: 3,
        weight: 2.5,
      },
    });
  });

  it('marks every blank required field', () => {
    const result = validateProductForm(EMPTY_VALUES);
    expect(result).toMatchObject({ ok: false });
    expect(Object.keys((result as { errors: object }).errors).sort()).toEqual([
      'brand',
      'category',
      'description',
      'price',
      'sku',
      'stock',
      'title',
      'weight',
    ]);
    expect(errorsFor({ price: '  ', category: '' })).toMatchObject({
      price: 'is required',
      category: 'is required',
    });
  });

  it('rejects text that is not a number', () => {
    expect(errorsFor({ price: 'abc' })).toEqual({ price: 'must be a number' });
    expect(errorsFor({ weight: 'Infinity' })).toEqual({ weight: 'must be a number' });
  });

  it.each([
    [{ price: '-1' }, { price: 'must be >= 0' }],
    [{ price: '9.999' }, { price: 'must have at most 2 decimal places' }],
    [{ stock: '1.5' }, { stock: 'must be an integer' }],
    [{ stock: '-2' }, { stock: 'must be >= 0' }],
    [{ weight: '0' }, { weight: 'must be > 0' }],
  ])('uses the shared schema message for %j', (overrides, expected) => {
    expect(errorsFor(overrides)).toEqual(expected);
  });

  it('rejects a category that is not a lowercase slug with the shared message', () => {
    expect(errorsFor({ category: 'Home Decor' }).category).toContain('lowercase slug');
  });

  it('reports several problems at once', () => {
    expect(Object.keys(errorsFor({ price: '-1', title: '', weight: '0' })).sort()).toEqual([
      'price',
      'title',
      'weight',
    ]);
  });
});

describe('detailsToFieldErrors', () => {
  it('maps details onto form fields, first message per field', () => {
    expect(
      detailsToFieldErrors([
        { path: 'sku', message: 'is already in use' },
        { path: 'sku', message: 'ignored' },
        { path: 'price', message: 'must be >= 0' },
      ]),
    ).toEqual({ fields: { sku: 'is already in use', price: 'must be >= 0' }, unmatched: [] });
  });

  it('keeps details for the whole payload or unknown fields as unmatched', () => {
    const whole = { path: '', message: 'must be valid JSON' };
    const unknown = { path: 'colour', message: 'nope' };

    expect(detailsToFieldErrors([whole, unknown])).toEqual({
      fields: {},
      unmatched: [whole, unknown],
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run apps/web/test/product-form.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/product-form.ts
import {
  createProductSchema,
  zodIssuesToDetails,
  type CreateProductInput,
  type ErrorDetail,
} from '@catalog/shared';

export const FORM_FIELDS = [
  'title',
  'description',
  'category',
  'brand',
  'sku',
  'price',
  'stock',
  'weight',
] as const;

export type FormField = (typeof FORM_FIELDS)[number];
/** Every input is a string while the user types; `validateProductForm` converts. */
export type ProductFormValues = Record<FormField, string>;
export type FieldErrors = Partial<Record<FormField, string>>;

export const EMPTY_VALUES: ProductFormValues = {
  title: '',
  description: '',
  category: '',
  brand: '',
  sku: '',
  price: '',
  stock: '',
  weight: '',
};

const NUMERIC_FIELDS = ['price', 'stock', 'weight'] as const;

export type FormResult =
  | { ok: true; input: CreateProductInput }
  | { ok: false; errors: FieldErrors };

function isFormField(path: string): path is FormField {
  return (FORM_FIELDS as readonly string[]).includes(path);
}

/**
 * Checks the form with the same Zod schema the API uses, so messages match. Blank and
 * non-numeric inputs are caught first because Zod's own message for them ("expected number")
 * is not useful in a form.
 */
export function validateProductForm(values: ProductFormValues): FormResult {
  const errors: FieldErrors = {};
  const raw: Record<string, unknown> = { ...values };

  if (values.category.trim() === '') errors.category = 'is required';
  for (const field of NUMERIC_FIELDS) {
    const text = values[field].trim();
    if (text === '') errors[field] = 'is required';
    else if (!Number.isFinite(Number(text))) errors[field] = 'must be a number';
    else raw[field] = Number(text);
  }

  const parsed = createProductSchema.safeParse(raw);
  if (parsed.success && Object.keys(errors).length === 0) return { ok: true, input: parsed.data };

  if (!parsed.success) {
    for (const { path, message } of zodIssuesToDetails(parsed.error)) {
      if (isFormField(path) && errors[path] === undefined) errors[path] = message;
    }
  }
  return { ok: false, errors };
}

/** Splits an API error's `details` into per-field messages and the ones no field can show. */
export function detailsToFieldErrors(details: ErrorDetail[]): {
  fields: FieldErrors;
  unmatched: ErrorDetail[];
} {
  const fields: FieldErrors = {};
  const unmatched: ErrorDetail[] = [];

  for (const detail of details) {
    if (!isFormField(detail.path)) unmatched.push(detail);
    else if (fields[detail.path] === undefined) fields[detail.path] = detail.message;
  }
  return { fields, unmatched };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run apps/web/test/product-form.test.ts`
Expected: PASS. If a schema-message expectation differs (for example the two-decimal message), fix the **test** to the shared schema's actual text only after confirming it in `packages/shared/src/product.ts`; never edit the shared messages.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/product-form.ts apps/web/test/product-form.test.ts
git commit -m "feat: validate the product form with the shared schema"
```

---

### Task 5: Dialog store

**Files:**
- Create: `apps/web/src/lib/stores/product-dialog.svelte.ts`
- Test: `apps/web/test/product-dialog.test.ts`

**Interfaces:**
- Consumes: `api.get`, `api.post`, `ApiError` from `apps/web/src/lib/api.ts` (`api.get<T>(path, { signal })`, `api.post<T>(path, body)`); `CatalogStore.update(patch: Partial<CatalogParams>): Promise<void>` and the `catalog` singleton from `catalog.svelte.ts`; `CatalogParams.sort` accepts `'-createdAt'` (confirm the type in `lib/query-params.ts`).
- Produces (exported from `product-dialog.svelte.ts`):
  - `type DialogView = { kind: 'closed' } | { kind: 'create' } | { kind: 'detail'; product: Product }`
  - `type DetailStatus = 'loading' | 'ready' | 'error'`
  - `class ProductDialogStore` with reactive fields `view: DialogView`, `detailStatus: DetailStatus`, `detailError: ApiError | null`, and methods `openDetail(product: Product): Promise<void>`, `openCreate(): void`, `close(): void`, `create(input: CreateProductInput): Promise<void>`. Constructor: `new ProductDialogStore(catalog: Pick<CatalogStore, 'update'>)`.
  - `const productDialog = new ProductDialogStore(catalog)`.

**Behaviour:**
- `openDetail(product)` shows the row's data at once (`detailStatus: 'loading'`), then fetches `GET /products/:id` and swaps in the server's copy (`'ready'`). On failure the row's data stays visible with `detailStatus: 'error'` and the `ApiError`. A newer open/close supersedes an in-flight fetch (abort; its result is ignored).
- `create(input)` posts; on success it calls `catalog.update({ q: '', category: '', sort: '-createdAt' })` (page resets to 1, newest first, filters cleared, so the new row is at the top), then — only if the modal still shows the create form — switches the view to that product's detail. On failure it **rejects with the `ApiError`** (the form maps it) and changes nothing.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/product-dialog.test.ts
import type { ItemResponse, Product } from '@catalog/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api.js';
import { ProductDialogStore } from '../src/lib/stores/product-dialog.svelte.js';

function product(id: number, overrides: Partial<Product> = {}): Product {
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
    ...overrides,
  };
}

const item = (data: Product): ItemResponse<Product> => ({ data });

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

const newInput = {
  title: 'Rocket Skates',
  description: 'Blast off.',
  category: 'gadgets',
  price: 19.99,
  stock: 3,
  brand: 'ACME',
  sku: 'ACM-1',
  weight: 2.5,
};

function setup() {
  const catalog = { update: vi.fn(async () => {}) };
  return { catalog, store: new ProductDialogStore(catalog) };
}

afterEach(() => vi.unstubAllGlobals());

describe('ProductDialogStore', () => {
  it('starts closed', () => {
    expect(setup().store.view).toEqual({ kind: 'closed' });
  });

  it('opens the create form and closes it', () => {
    const { store } = setup();

    store.openCreate();
    expect(store.view).toEqual({ kind: 'create' });
    store.close();
    expect(store.view).toEqual({ kind: 'closed' });
  });

  it('shows the row at once, then swaps in the server copy', async () => {
    const reply = deferred<Response>();
    const fetchMock = vi.fn((_url: string) => reply.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { store } = setup();
    const row = product(5, { stock: 10 });

    const opening = store.openDetail(row);
    expect(store.view).toEqual({ kind: 'detail', product: row });
    expect(store.detailStatus).toBe('loading');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products/5');

    reply.resolve(json(item(product(5, { stock: 4 }))));
    await opening;

    expect(store.view).toEqual({ kind: 'detail', product: product(5, { stock: 4 }) });
    expect(store.detailStatus).toBe('ready');
    expect(store.detailError).toBeNull();
  });

  it('keeps showing the row and records the error when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ error: { code: 'NOT_FOUND', message: 'Product 5 not found' } }, 404),
      ),
    );
    const { store } = setup();
    const row = product(5);

    await store.openDetail(row);

    expect(store.view).toEqual({ kind: 'detail', product: row });
    expect(store.detailStatus).toBe('error');
    expect(store.detailError?.code).toBe('NOT_FOUND');
  });

  it('ignores the response of a superseded detail fetch', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    );
    const { store } = setup();

    const openingA = store.openDetail(product(1));
    const openingB = store.openDetail(product(2));
    second.resolve(json(item(product(2, { title: 'B fresh' }))));
    await openingB;
    first.resolve(json(item(product(1, { title: 'A stale' }))));
    await openingA;

    expect(store.view).toEqual({ kind: 'detail', product: product(2, { title: 'B fresh' }) });
  });

  it('aborts an in-flight detail fetch when closed', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      }),
    );
    const { store } = setup();

    void store.openDetail(product(1));
    store.close();

    expect(signal?.aborted).toBe(true);
    expect(store.view).toEqual({ kind: 'closed' });
  });

  describe('create', () => {
    it('posts, refreshes the list newest-first, and shows the new product', async () => {
      const created = product(37, { title: 'Rocket Skates' });
      const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
        json(item(created), 201),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { store, catalog } = setup();
      store.openCreate();

      await store.create(newInput);

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('/api/products');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual(newInput);
      expect(catalog.update).toHaveBeenCalledWith({ q: '', category: '', sort: '-createdAt' });
      expect(store.view).toEqual({ kind: 'detail', product: created });
      expect(store.detailStatus).toBe('ready');
    });

    it('rejects with the ApiError and leaves the form open when the server refuses', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          json(
            {
              error: {
                code: 'CONFLICT',
                message: 'A product with SKU "ACM-1" already exists',
                details: [{ path: 'sku', message: 'is already in use' }],
              },
            },
            409,
          ),
        ),
      );
      const { store, catalog } = setup();
      store.openCreate();

      const failure = await store.create(newInput).catch((cause: unknown) => cause);

      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).details).toEqual([
        { path: 'sku', message: 'is already in use' },
      ]);
      expect(store.view).toEqual({ kind: 'create' });
      expect(catalog.update).not.toHaveBeenCalled();
    });

    it('does not reopen the modal if it was closed while the request was in flight', async () => {
      const reply = deferred<Response>();
      vi.stubGlobal(
        'fetch',
        vi.fn(() => reply.promise),
      );
      const { store } = setup();
      store.openCreate();

      const creating = store.create(newInput);
      store.close();
      reply.resolve(json(item(product(37)), 201));
      await creating;

      expect(store.view).toEqual({ kind: 'closed' });
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run apps/web/test/product-dialog.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/stores/product-dialog.svelte.ts
import type { CreateProductInput, Product } from '@catalog/shared';
import { api, ApiError } from '../api.js';
import { catalog, type CatalogStore } from './catalog.svelte.js';

export type DialogView =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'detail'; product: Product };

export type DetailStatus = 'loading' | 'ready' | 'error';

/** What the product modal shows, and the flows that change it. */
export class ProductDialogStore {
  view = $state<DialogView>({ kind: 'closed' });
  detailStatus = $state<DetailStatus>('ready');
  detailError = $state<ApiError | null>(null);

  #catalog: Pick<CatalogStore, 'update'>;
  #inFlight: AbortController | undefined;

  constructor(catalog: Pick<CatalogStore, 'update'>) {
    this.#catalog = catalog;
  }

  openCreate(): void {
    this.#cancelDetailFetch();
    this.view = { kind: 'create' };
  }

  close(): void {
    this.#cancelDetailFetch();
    this.view = { kind: 'closed' };
  }

  /** Shows the row's data at once, then replaces it with the server's copy of the record. */
  async openDetail(product: Product): Promise<void> {
    this.#cancelDetailFetch();
    const request = new AbortController();
    this.#inFlight = request;

    this.view = { kind: 'detail', product };
    this.detailStatus = 'loading';
    this.detailError = null;

    try {
      const fresh = await api.get<Product>(`/products/${product.id}`, { signal: request.signal });
      if (request.signal.aborted) return;

      this.view = { kind: 'detail', product: fresh };
      this.detailStatus = 'ready';
    } catch (cause) {
      if (request.signal.aborted) return;

      this.detailError =
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
      this.detailStatus = 'error';
    }
  }

  /**
   * Creates the product. A refusal rejects with the `ApiError` so the form can map its `details`
   * onto fields. On success the list is reset to newest-first (so the new row is at the top) and
   * the modal shows the new product, unless it was closed in the meantime.
   */
  async create(input: CreateProductInput): Promise<void> {
    const product = await api.post<Product>('/products', input);
    await this.#catalog.update({ q: '', category: '', sort: '-createdAt' });

    if (this.view.kind !== 'create') return;
    this.view = { kind: 'detail', product };
    this.detailStatus = 'ready';
    this.detailError = null;
  }

  #cancelDetailFetch(): void {
    this.#inFlight?.abort();
    this.#inFlight = undefined;
  }
}

export const productDialog = new ProductDialogStore(catalog);
```

- [ ] **Step 4: Run to verify it passes, plus typecheck**

Run: `pnpm exec vitest run apps/web && pnpm typecheck`
Expected: PASS. If typecheck rejects `sort: '-createdAt'`, `CatalogParams.sort` in `lib/query-params.ts` is narrower than `SortParam | ''`; fix by using its actual type, not by casting.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/product-dialog.svelte.ts apps/web/test/product-dialog.test.ts
git commit -m "feat: add the product dialog store"
```

---

### Task 6: Modal, detail view, form and dashboard wiring

No automated tests (see Global Constraints); the logic they call is covered in Tasks 4 and 5. Verification is `pnpm typecheck`, `pnpm lint`, and the manual check in Steps 7-8.

**Files:**
- Create: `apps/web/src/components/Modal.svelte`, `apps/web/src/components/ProductForm.svelte`, `apps/web/src/views/ProductDetail.svelte`, `apps/web/src/views/ProductDialog.svelte`
- Modify: `apps/web/src/components/ProductTable.svelte`, `apps/web/src/views/Dashboard.svelte`

**Interfaces:**
- Consumes: `productDialog`, `DialogView`, `DetailStatus` (Task 5); `validateProductForm`, `detailsToFieldErrors`, `EMPTY_VALUES`, `FORM_FIELDS`, `FormField`, `FieldErrors`, `ProductFormValues` (Task 4); `ApiError`; `stockStatus`, `Product`, `CreateProductInput` from `@catalog/shared`.
- Produces: `Modal` props `{ title: string; onclose: () => void; children: Snippet }`; `ProductForm` props `{ onsubmit: (input: CreateProductInput) => Promise<void>; oncancel: () => void }`; `ProductTable` gains prop `onselect: (product: Product) => void`.

- [ ] **Step 1: `Modal.svelte`**

Native `<dialog>` opened with `showModal()`: the browser provides Escape-to-close, makes everything outside inert (the focus trap), and restores focus to the opener on close. The dialog has no padding; an inner div does, so a click whose target is the `<dialog>` itself is a backdrop click.

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } =
    $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  });
</script>

<!-- Escape is handled natively by <dialog>; the click handler only adds backdrop-click-to-close. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  aria-labelledby="modal-title"
  class="m-auto w-full max-w-2xl rounded-lg bg-white p-0 shadow-xl backdrop:bg-slate-900/50"
  {onclose}
  onclick={(event) => {
    if (event.target === dialog) dialog.close();
  }}
>
  <div class="p-6">
    <div class="flex items-start justify-between gap-4">
      <h2 id="modal-title" class="text-lg font-semibold break-words text-slate-900">{title}</h2>
      <button
        type="button"
        class="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
        aria-label="Close"
        onclick={() => dialog.close()}
      >
        ✕
      </button>
    </div>
    <div class="mt-4">{@render children()}</div>
  </div>
</dialog>
```

- [ ] **Step 2: `ProductForm.svelte`**

Text inputs only (numeric fields use `type="text"` with `inputmode`, because Svelte forbids a dynamic `type` with `bind:value`, and the validator does the number parsing). `novalidate` so the shared-schema messages show instead of the browser's. The category is a plain slug input until B-11.

```svelte
<script lang="ts">
  import type { CreateProductInput } from '@catalog/shared';
  import { tick } from 'svelte';
  import { ApiError } from '../lib/api.js';
  import {
    detailsToFieldErrors,
    EMPTY_VALUES,
    validateProductForm,
    type FieldErrors,
    type FormField,
    type ProductFormValues,
  } from '../lib/product-form.js';

  let {
    onsubmit,
    oncancel,
  }: { onsubmit: (input: CreateProductInput) => Promise<void>; oncancel: () => void } = $props();

  interface FieldSpec {
    name: FormField;
    label: string;
    hint?: string;
    inputmode?: 'decimal' | 'numeric';
    wide?: boolean;
  }

  const fields: FieldSpec[] = [
    { name: 'title', label: 'Title', wide: true },
    { name: 'description', label: 'Description', wide: true },
    { name: 'category', label: 'Category', hint: 'Lowercase slug of an existing category, e.g. automotive' },
    { name: 'brand', label: 'Brand' },
    { name: 'sku', label: 'SKU' },
    { name: 'price', label: 'Price', inputmode: 'decimal' },
    { name: 'stock', label: 'Stock', inputmode: 'numeric' },
    { name: 'weight', label: 'Weight', inputmode: 'decimal' },
  ];

  let form: HTMLFormElement;
  let values = $state<ProductFormValues>({ ...EMPTY_VALUES });
  let errors = $state<FieldErrors>({});
  let formError = $state('');
  let pending = $state(false);

  async function focusFirstError() {
    await tick();
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending) return;
    formError = '';

    const result = validateProductForm(values);
    if (!result.ok) {
      errors = result.errors;
      await focusFirstError();
      return;
    }
    errors = {};

    pending = true;
    try {
      await onsubmit(result.input);
    } catch (cause) {
      if (cause instanceof ApiError) {
        // A server detail that names a field goes on that field; anything else is a banner.
        const { fields: fieldErrors, unmatched } = detailsToFieldErrors(cause.details);
        errors = fieldErrors;
        if (Object.keys(fieldErrors).length === 0) formError = cause.message;
        else if (unmatched.length > 0) formError = unmatched.map((detail) => detail.message).join('. ');
        await focusFirstError();
      } else {
        formError = 'Something went wrong. Please try again.';
      }
    } finally {
      pending = false;
    }
  }
</script>

<form bind:this={form} novalidate class="grid gap-4 sm:grid-cols-2" onsubmit={submit}>
  {#each fields as field (field.name)}
    <div class={field.wide ? 'sm:col-span-2' : ''}>
      <label for="field-{field.name}" class="block text-sm font-medium text-slate-700">
        {field.label}
      </label>
      {#if field.name === 'description'}
        <textarea
          id="field-{field.name}"
          rows="3"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          aria-invalid={errors[field.name] ? 'true' : undefined}
          aria-describedby={errors[field.name] ? `error-${field.name}` : undefined}
          bind:value={values[field.name]}
        ></textarea>
      {:else}
        <input
          id="field-{field.name}"
          type="text"
          inputmode={field.inputmode}
          autocomplete="off"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          aria-invalid={errors[field.name] ? 'true' : undefined}
          aria-describedby={errors[field.name] ? `error-${field.name}` : undefined}
          bind:value={values[field.name]}
        />
      {/if}
      {#if field.hint && !errors[field.name]}
        <p class="mt-1 text-xs text-slate-500">{field.hint}</p>
      {/if}
      {#if errors[field.name]}
        <p id="error-{field.name}" class="mt-1 text-sm text-red-700">{errors[field.name]}</p>
      {/if}
    </div>
  {/each}

  {#if formError}
    <p role="alert" class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">
      {formError}
    </p>
  {/if}

  <div class="flex justify-end gap-3 sm:col-span-2">
    <button
      type="button"
      class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
      onclick={oncancel}
    >
      Cancel
    </button>
    <button
      type="submit"
      class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      disabled={pending}
    >
      {pending ? 'Creating…' : 'Create product'}
    </button>
  </div>
</form>
```

- [ ] **Step 3: `ProductDetail.svelte`**

Shows every field of the record, the derived stock badge (same labels as `ProductTable`; if duplicating the badge map bothers you, extract it to `lib/stock-badge.ts` and use it in both places), the two timestamps, a "refreshing" / error line from `detailStatus`, and **disabled** Edit and Delete buttons (`disabled`, `title="Coming soon"`), which B-10 wires.

```svelte
<script lang="ts">
  import { stockStatus, type Product, type StockStatus } from '@catalog/shared';
  import type { ApiError } from '../lib/api.js';
  import type { DetailStatus } from '../lib/stores/product-dialog.svelte.js';

  let {
    product,
    status,
    error,
  }: { product: Product; status: DetailStatus; error: ApiError | null } = $props();

  const badges: Record<StockStatus, { label: string; classes: string }> = {
    out: { label: 'Out of stock', classes: 'bg-red-100 text-red-800' },
    low: { label: 'Low stock', classes: 'bg-amber-100 text-amber-800' },
    in: { label: 'In stock', classes: 'bg-emerald-100 text-emerald-800' },
  };
  const badge = $derived(badges[stockStatus(product.stock)]);
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const when = (iso: string) => new Date(iso).toLocaleString();
</script>

{#if status === 'error'}
  <p role="alert" class="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
    Could not refresh this product: {error?.message}. Showing the version from the list.
  </p>
{:else if status === 'loading'}
  <p role="status" class="mb-4 text-sm text-slate-500">Refreshing…</p>
{/if}

<dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
  <div class="sm:col-span-2">
    <dt class="text-xs font-medium text-slate-500 uppercase">Description</dt>
    <dd class="mt-0.5 whitespace-pre-wrap text-slate-900">{product.description}</dd>
  </div>
  <div><dt class="text-xs font-medium text-slate-500 uppercase">Brand</dt><dd class="mt-0.5">{product.brand}</dd></div>
  <div><dt class="text-xs font-medium text-slate-500 uppercase">Category</dt><dd class="mt-0.5">{product.category}</dd></div>
  <div><dt class="text-xs font-medium text-slate-500 uppercase">SKU</dt><dd class="mt-0.5">{product.sku}</dd></div>
  <div><dt class="text-xs font-medium text-slate-500 uppercase">Price</dt><dd class="mt-0.5 tabular-nums">{currency.format(product.price)}</dd></div>
  <div>
    <dt class="text-xs font-medium text-slate-500 uppercase">Stock</dt>
    <dd class="mt-0.5 flex items-center gap-2">
      <span class="tabular-nums">{product.stock}</span>
      <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {badge.classes}">{badge.label}</span>
    </dd>
  </div>
  <div><dt class="text-xs font-medium text-slate-500 uppercase">Weight</dt><dd class="mt-0.5 tabular-nums">{product.weight}</dd></div>
  <div><dt class="text-xs font-medium text-slate-500 uppercase">Created</dt><dd class="mt-0.5">{when(product.meta.createdAt)}</dd></div>
  <div><dt class="text-xs font-medium text-slate-500 uppercase">Updated</dt><dd class="mt-0.5">{when(product.meta.updatedAt)}</dd></div>
</dl>

<div class="mt-6 flex justify-end gap-3">
  <button type="button" disabled title="Coming soon" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50">Edit</button>
  <button type="button" disabled title="Coming soon" class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 disabled:opacity-50">Delete</button>
</div>
```

(Run `pnpm exec prettier --write` on the `.svelte` files afterwards; the one-line `<div>` rows above are for brevity and will be reformatted.)

- [ ] **Step 4: `ProductDialog.svelte`**

```svelte
<script lang="ts">
  import Modal from '../components/Modal.svelte';
  import ProductForm from '../components/ProductForm.svelte';
  import { productDialog } from '../lib/stores/product-dialog.svelte.js';
  import ProductDetail from './ProductDetail.svelte';
</script>

{#if productDialog.view.kind !== 'closed'}
  {@const view = productDialog.view}
  <Modal
    title={view.kind === 'detail' ? view.product.title : 'New product'}
    onclose={() => productDialog.close()}
  >
    {#if view.kind === 'create'}
      <ProductForm
        onsubmit={(input) => productDialog.create(input)}
        oncancel={() => productDialog.close()}
      />
    {:else if view.kind === 'detail'}
      <ProductDetail
        product={view.product}
        status={productDialog.detailStatus}
        error={productDialog.detailError}
      />
    {/if}
  </Modal>
{/if}
```

If `{@const}` does not narrow `view` in the type-checker, switch to `{#if productDialog.view.kind === 'create'} … {:else if productDialog.view.kind === 'detail'}` with `productDialog.view.product` (still narrowed inside each branch).

- [ ] **Step 5: `ProductTable.svelte` and `Dashboard.svelte`**

`ProductTable`: add `onselect` to the props and make the whole row clickable, with the title as a real `<button>` so keyboard users can reach it. A click on the button bubbles to the row, so only the row needs the handler.

```svelte
let { products, onselect }: { products: Product[]; onselect: (product: Product) => void } = $props();
```

```svelte
<!-- The row click is a mouse convenience; the title button below is the keyboard path (its click bubbles here). -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<tr class="cursor-pointer hover:bg-slate-50" onclick={() => onselect(product)}>
  <td class="px-4 py-3">
    <button type="button" class="text-left font-medium text-slate-900 hover:underline">
      {product.title}
    </button>
    <div class="text-xs text-slate-500">{product.sku}</div>
  </td>
  <!-- remaining cells unchanged -->
```

`Dashboard`: import `ProductDialog` and `productDialog`; replace the `<h2>` line with a header row holding the heading and a "New product" button; pass `onselect`; mount the dialog once as the last child of the section.

```svelte
<div class="flex items-center justify-between gap-4">
  <h2 id="products-heading" class="text-lg font-semibold text-slate-900">Products</h2>
  <button
    type="button"
    class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
    onclick={() => productDialog.openCreate()}
  >
    New product
  </button>
</div>
```

```svelte
<ProductTable products={catalog.products} onselect={(product) => void productDialog.openDetail(product)} />
```

and, as the last child inside the `<section>`: `<ProductDialog />`.

- [ ] **Step 6: Verify statically**

Run: `pnpm exec prettier --write apps/web/src && pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS. Fix any `svelte-check` a11y warning by following its message, not by removing the accessibility affordance.

- [ ] **Step 7: Verify in the browser (use the `run` skill or Playwright)**

Run `pnpm db:seed` then `pnpm dev`; open `http://localhost:5173`. Check each, and note anything that fails:
1. Click a row: modal opens with the full record; Edit and Delete are visible but disabled. Escape closes it; reopening and clicking the dark backdrop closes it; Tab never leaves the modal; focus returns to the row's title button on close.
2. Press Enter on a focused title button: the modal opens (keyboard path).
3. "New product": submit empty -> field errors on every field, focus on the first. Price `-1` -> `must be >= 0` under Price. Category `Home Decor` -> slug message.
4. Category `nope` with otherwise valid values -> the error appears **under Category** (server `400` details), modal stays open, entered values are kept.
5. Reuse an existing SKU (see any row) -> the error appears **under SKU** (server `409` details), not as a banner.
6. Valid submit (category `automotive`, new SKU) -> button shows "Creating…" while pending; on success the modal switches to the new product's detail and the list behind it is newest-first with the new product on top; filters and search are cleared.
7. Stop the API and submit -> a banner "Could not reach the server" and the form stays open.
8. Open a product in the detail modal, then stop the API and click another row -> the row's data shows with the "Could not refresh" notice.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat: add the product detail modal and create form to the dashboard"
```

---

### Task 7: Docs and handoff

**Files:**
- Modify: `docs/technical-decisions.md`, `docs/backlog.md`

- [ ] **Step 1: Record the decisions in `docs/technical-decisions.md`** (the document is binding, so it changes in the same branch):
  - §3.2 / §3.3: `POST` order of checks (schema `400` -> category `400` naming `category` -> sku `409`); a `409` for a duplicate sku carries `details: [{ path: 'sku', message: 'is already in use' }]` so a client can attach it to the field; a request body that is not JSON is `400 VALIDATION_ERROR` with the empty path; the `:id` path parameter is validated by `productIdParamSchema`.
  - §2 layout: add `routes/json-body.ts`, `components/Modal.svelte`, `views/ProductDialog.svelte`, `lib/product-form.ts`, `lib/stores/product-dialog.svelte.ts`.
  - §5: the modal is a native `<dialog>` (`showModal()`), which supplies Escape, the focus trap and focus restoration; opening a row shows the list's data immediately and refreshes it from `GET /api/products/:id`; after a successful create the list resets to newest-first with filters cleared and the modal shows the new product; the category field is a free-text slug until B-11 provides the list.

- [ ] **Step 2: Mark B-07 `Done` in `docs/backlog.md`.** Add one line to B-10's Web section: "The detail modal's Edit and Delete buttons already exist, disabled (B-07); enable and wire them."

- [ ] **Step 3: Final verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS. Record the passing test count in your report (baseline before the branch: run `pnpm test` on `main` first and note it).

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: record the B-07 detail and create decisions"
```

- [ ] **Step 5: Stop and hand back.** Do not merge or push to `main`. Report: branch name, commits, test counts, and anything from the manual check in Task 6 that could not be verified. Then, per `CLAUDE.md`, ask the user for their `AI.md` entry for this slice (invoke the `ai-log` skill); do not write it yourself.

---

## Self-Review

**Spec coverage (backlog B-07):**
- `GET /:id` envelope, `404`, non-numeric `400` -> Tasks 1-2.
- `POST` validate, `201`, server-owned `id`/timestamps ignored, negative price naming `price`, unknown category naming `category` and never created, duplicate sku `409` -> Task 3 tests, one per rule.
- Row click opens modal with full record; Edit/Delete affordances (disabled, wired in B-10); Escape, backdrop click, focus trap -> Task 6 (native `<dialog>`; manual checks 1-2).
- One `ProductForm` validated with the shared schema; "New product" button in the same modal shell -> Tasks 4 and 6.
- On success the list refreshes and the new product is visible -> Task 5 (`create`) and manual check 6.
- Server `details` map onto fields (duplicate sku on the sku field) -> `detailsToFieldErrors` (Task 4), `409` details (Task 3), manual checks 4-5.
- Explicit pending and error states on submit -> `pending` and `formError` in Task 6; manual checks 6-7.
- Standing OpenAPI rule -> already documented; Task 3 Step 6 and the existing "missing from document" test.

**Placeholder scan:** none; every code step has code.

**Type consistency:** `ProductRepository.findById/findCategoryId/skuExists/insert`, `NewProduct`, `ProductService.get/create`, `productIdParamSchema`, `readJsonBody`, `validateProductForm`, `detailsToFieldErrors`, `FieldErrors`, `ProductFormValues`, `ProductDialogStore.openDetail/openCreate/close/create`, `DetailStatus`, `DialogView` are named identically in every task that uses them.
