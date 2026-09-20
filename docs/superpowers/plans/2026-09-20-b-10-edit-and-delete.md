# B-10 Edit and Delete Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `PATCH /api/products/:id` and `DELETE /api/products/:id`, and make the detail modal's Edit and Delete buttons work: edit reuses the one `ProductForm` pre-filled and sends only changed fields; delete needs an explicit confirmation step.

**Architecture:** API stays `routes -> services -> repositories`. The repository gains `update` and `delete` (both report whether a row matched) and `skuExists` learns to ignore the product being edited; the service owns the rules (404, unknown category `400`, duplicate sku `409`, `updatedAt`). On the web, `ProductDialogStore` gains two more views (`edit`, `delete`) inside the same modal; `ProductForm` takes an optional `product` to become the edit form; a pure `changedFields` computes the patch; `CatalogStore.reloadAfterDelete` keeps the pager on a valid page.

**Tech Stack:** TypeScript, Hono, Drizzle + better-sqlite3, Zod (`packages/shared`), Svelte 5 runes, Tailwind v4, Vitest, pnpm workspaces.

**Spec:** No separate spec file. Requirements: `docs/backlog.md` item B-10; contracts: `docs/technical-decisions.md` §3 (API), §4 (data model), §5 (SPA), §6 (tests). Style and structure reference: `docs/superpowers/plans/2026-09-20-b-07-product-detail-and-create.md` (B-07, merged), whose code this plan extends.

## Global Constraints

- Branch: `feat/b-10-edit-and-delete`, created from `main`. Never commit to `main`. Do **not** open a PR and do **not** merge: stop after Task 6 and hand back for review (the maintainer merges locally with `--no-ff`).
- Commit messages: a single line with a Conventional Commits prefix (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`). No body, no footers, never a `Co-Authored-By` trailer. This project rule overrides any tool default that says otherwise.
- The pre-commit hook runs `pnpm audit` and needs network access. Do not use `--no-verify` unless offline.
- Layering is enforced by ESLint (`pnpm lint` fails on a violation): routes may not import `drizzle-orm`, `better-sqlite3`, `**/db/**` or `**/repositories/**`; services may not import `hono`, `drizzle-orm`, `**/db/**`, `**/routes/**` or `**/middleware/**`; repositories may not import `hono`, `**/errors`, `**/middleware/**`, `**/routes/**` or `**/services/**`. Repositories never throw HTTP errors; services throw `ValidationError` / `NotFoundError` / `ConflictError` from `apps/api/src/errors.ts`.
- Never duplicate the product contract: import `patchProductSchema`, `PatchProductInput`, `Product`, `CreateProductInput`, `productIdParamSchema` from `@catalog/shared`. Do not add a `zod` dependency to `apps/api` or `apps/web`, and do not change `packages/shared`.
- Errors use the §3.3 envelope only through `middleware/error-handler.ts`; a route never hand-writes an error response.
- `id`, `meta.createdAt` and `meta.updatedAt` are server-owned: a `PATCH` body carrying them has them stripped (Zod's `z.object` strips unknown keys). A body that is empty **after** stripping is `400 VALIDATION_ERROR` with `details: [{ path: '', message: 'must include at least one field' }]` (already produced by `patchProductSchema`).
- A product write never creates a category: an unknown `category` slug in a `PATCH` is `400 VALIDATION_ERROR` with `details` naming `category`.
- A `PATCH` that re-sends a product's **own** sku is not a conflict. A sku owned by a **different** product is `409 CONFLICT` with `details: [{ path: 'sku', message: 'is already in use' }]` (the same shape `POST` uses).
- TypeScript is strict with `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and (judging by the existing `q?: string | undefined` style) `exactOptionalPropertyTypes`: declare optional properties as `x?: T | undefined` where a value may be passed through. The web app is type-checked with `svelte-check` via `pnpm typecheck`.
- Prettier: single quotes, semicolons, trailing commas, print width 100. Run `pnpm exec prettier --write <files>` if `pnpm lint` reports formatting.
- Do not put a file-path comment on the first line of any file (B-07 review found three of these copied from a plan; the codebase does not use them).
- Scope boundary: no categories endpoints, no category dropdown (B-11); the form's category field stays a free-text slug. No undo for delete, no bulk delete, no soft delete.
- The web app has no component-test setup (Vitest runs in the Node environment, `*.svelte` files are not tested). Logic that needs tests lives in plain `.ts` / `.svelte.ts` modules; components are verified by the manual browser check in Task 5. Do not add jsdom or a component-testing library.
- Baseline before this plan: `pnpm test` = 22 files, 252 tests, all passing.
- `CLAUDE.md`: after this slice is finished, **stop and ask the user for the `AI.md` entry** (use the `ai-log` skill). Never write an `AI.md` entry yourself.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/repositories/product-repository.ts` | Modify | `skuExists(sku, exceptId?)`; add `update`, `delete`; `ProductChanges` type |
| `apps/api/src/services/product-service.ts` | Modify | add `update(id, patch)` and `delete(id)` |
| `apps/api/src/routes/products.ts` | Modify | `PATCH /:id` and `DELETE /:id` |
| `apps/api/test/product-update.test.ts` | Create | integration tests for `PATCH`, plus a service-level clock test |
| `apps/api/test/product-delete.test.ts` | Create | integration tests for `DELETE` |
| `apps/api/test/openapi.test.ts` | Modify | mark both operations implemented; repoint the "flips on" test |
| `apps/web/src/lib/product-form.ts` | Modify | add `valuesFromProduct`, `changedFields` |
| `apps/web/test/product-form.test.ts` | Modify | tests for the two new functions |
| `apps/web/src/lib/stores/catalog.svelte.ts` | Modify | add `reloadAfterDelete()` |
| `apps/web/test/catalog.test.ts` | Modify | tests for `reloadAfterDelete` |
| `apps/web/src/lib/stores/product-dialog.svelte.ts` | Modify | `edit` / `delete` views and `openEdit`, `openDelete`, `backToDetail`, `update`, `remove` |
| `apps/web/test/product-dialog.test.ts` | Modify | widen `setup()`; tests for edit and delete flows |
| `apps/web/src/components/ProductForm.svelte` | Modify | optional `product` prop: pre-filled, "Save changes" |
| `apps/web/src/views/ProductDetail.svelte` | Modify | enable Edit / Delete via `onedit` / `ondelete` |
| `apps/web/src/views/ProductDeleteConfirm.svelte` | Create | the confirmation step, with pending and error states |
| `apps/web/src/views/ProductDialog.svelte` | Modify | render the two new views; per-view titles |
| `docs/technical-decisions.md`, `docs/backlog.md` | Modify | record the decisions below; mark B-10 Done |

---

### Task 1: `PATCH /api/products/:id`

**Files:**
- Modify: `apps/api/src/repositories/product-repository.ts`
- Modify: `apps/api/src/services/product-service.ts`
- Modify: `apps/api/src/routes/products.ts`
- Modify: `apps/api/test/openapi.test.ts` (the `IMPLEMENTED_OPERATIONS` set, line ~57)
- Test: `apps/api/test/product-update.test.ts`

**Interfaces:**
- Consumes: `patchProductSchema`, `PatchProductInput`, `productIdParamSchema` (shared); `readJsonBody(c)` (`routes/json-body.ts`, from B-07); `ProductService.get`, `toProduct`, `findById`, `findCategoryId` (B-07); `ValidationError`, `ConflictError`, `NotFoundError` (`errors.ts`).
- Produces:
  - `ProductChanges` (exported from the repository): `{ title?: string | undefined; description?: string | undefined; categoryId?: number | undefined; price?: number | undefined; stock?: number | undefined; brand?: string | undefined; sku?: string | undefined; weight?: number | undefined; updatedAt: string }`
  - `ProductRepository.skuExists(sku: string, exceptId?: number): boolean` (existing callers unchanged)
  - `ProductRepository.update(id: number, changes: ProductChanges): boolean` (true when a row matched)
  - `ProductService.update(id: number, patch: PatchProductInput): Product`
  - Route `PATCH /api/products/:id` -> `200 { "data": Product }`; `400 VALIDATION_ERROR`; `404 NOT_FOUND`; `409 CONFLICT`.

**Rules encoded here (verify against the tests):**
- Order of checks: id (`400`) -> body JSON (`400`) -> schema (`400`) -> product exists (`404`) -> category exists (`400` naming `category`) -> sku owned by another product (`409`).
- `updatedAt` is set to the injected clock's time; `createdAt` is never written.
- Only the fields present in the patch are written.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/test/product-update.test.ts
import {
  type ErrorResponse,
  type ItemResponse,
  type ListResponse,
  type Product,
} from '@catalog/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadSeedData, seedDatabase } from '../src/db/seed.js';
import { createProductRepository } from '../src/repositories/product-repository.js';
import { createProductService } from '../src/services/product-service.js';
import { createTestDb, type TestDb } from './helpers.js';

const seed = loadSeedData();
const target = seed[0]!;
const other = seed.find((product) => product.category !== target.category)!;

describe('PATCH /api/products/:id', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  const patch = (id: number | string, body: unknown) =>
    app.request(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const read = async (id: number) =>
    ((await (await app.request(`/api/products/${id}`)).json()) as ItemResponse<Product>).data;
  const errorOf = async (res: Response) => ((await res.json()) as ErrorResponse).error;

  beforeEach(() => {
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
    app = createApp({ db: testDb.db });
  });
  afterEach(() => testDb.cleanup());

  it('changes the field, keeps the rest, and refreshes updatedAt but not createdAt', async () => {
    const res = await patch(target.id, { price: 7.99, stock: 40 });
    const { data } = (await res.json()) as ItemResponse<Product>;

    expect(res.status).toBe(200);
    expect(data).toEqual({
      ...target,
      price: 7.99,
      stock: 40,
      meta: { createdAt: target.meta.createdAt, updatedAt: data.meta.updatedAt },
    });
    expect(Date.parse(data.meta.updatedAt)).toBeGreaterThan(Date.parse(target.meta.updatedAt));
    expect(data.meta.createdAt).toBe(target.meta.createdAt);
  });

  it('persists the change so a later read and the list show it', async () => {
    await patch(target.id, { title: 'Renamed Thing' });

    expect((await read(target.id)).title).toBe('Renamed Thing');
    const list = (await (await app.request('/api/products?q=Renamed')).json()) as ListResponse<Product>;
    expect(list.data.map((product) => product.id)).toEqual([target.id]);
  });

  it('moves the product to another existing category', async () => {
    const res = await patch(target.id, { category: other.category });

    expect(((await res.json()) as ItemResponse<Product>).data.category).toBe(other.category);
  });

  it('trims title, brand and sku, like a create', async () => {
    const res = await patch(target.id, { title: '  Padded  ', sku: '  PAD-1  ' });
    const { data } = (await res.json()) as ItemResponse<Product>;

    expect(data).toMatchObject({ title: 'Padded', sku: 'PAD-1' });
  });

  it('ignores a client-sent id and meta', async () => {
    const res = await patch(target.id, {
      id: 999,
      meta: { createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z' },
      stock: 1,
    });
    const { data } = (await res.json()) as ItemResponse<Product>;

    expect(res.status).toBe(200);
    expect(data.id).toBe(target.id);
    expect(data.meta.createdAt).toBe(target.meta.createdAt);
    expect(data.meta.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('answers 404 NOT_FOUND for an unknown id', async () => {
    const res = await patch(999999, { stock: 1 });
    const error = await errorOf(res);

    expect(res.status).toBe(404);
    expect(error).toEqual({ code: 'NOT_FOUND', message: 'Product 999999 not found' });
  });

  it.each(['abc', '1.5', '0'])('answers 400 VALIDATION_ERROR for the id "%s"', async (id) => {
    const res = await patch(id, { stock: 1 });
    const error = await errorOf(res);

    expect(res.status).toBe(400);
    expect(error.details?.map((detail) => detail.path)).toEqual(['id']);
  });

  it('rejects an unknown category naming category, and changes nothing', async () => {
    const res = await patch(target.id, { category: 'ghost-town', stock: 1 });
    const error = await errorOf(res);

    expect(res.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.map((detail) => detail.path)).toEqual(['category']);
    expect(await read(target.id)).toEqual(target);
  });

  it('rejects a negative price naming price, and changes nothing', async () => {
    const res = await patch(target.id, { price: -1 });
    const error = await errorOf(res);

    expect(res.status).toBe(400);
    expect(error.details).toEqual([{ path: 'price', message: 'must be >= 0' }]);
    expect(await read(target.id)).toEqual(target);
  });

  it('answers 409 CONFLICT with details naming sku for a sku another product owns', async () => {
    const res = await patch(target.id, { sku: other.sku });
    const error = await errorOf(res);

    expect(res.status).toBe(409);
    expect(error.code).toBe('CONFLICT');
    expect(error.details).toEqual([{ path: 'sku', message: 'is already in use' }]);
    expect(await read(target.id)).toEqual(target);
  });

  it('accepts a product re-sending its own sku', async () => {
    const res = await patch(target.id, { sku: target.sku, stock: 5 });

    expect(res.status).toBe(200);
    expect(((await res.json()) as ItemResponse<Product>).data.stock).toBe(5);
  });

  it('answers 400 for an empty body and for one that only holds server-owned fields', async () => {
    for (const body of [{}, { id: 5, meta: {} }]) {
      const res = await patch(target.id, body);
      const error = await errorOf(res);

      expect(res.status).toBe(400);
      expect(error.details).toEqual([{ path: '', message: 'must include at least one field' }]);
    }
  });

  it('answers 400 VALIDATION_ERROR for a body that is not JSON', async () => {
    const res = await patch(target.id, '{ not json');
    const error = await errorOf(res);

    expect(res.status).toBe(400);
    expect(error.details).toEqual([{ path: '', message: 'must be valid JSON' }]);
  });
});

describe('ProductService.update', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
  });
  afterEach(() => testDb.cleanup());

  it('stamps updatedAt from the clock and leaves createdAt alone', () => {
    const service = createProductService(
      createProductRepository(testDb.db),
      () => new Date('2030-01-02T03:04:05.000Z'),
    );

    const updated = service.update(target.id, { stock: 1 });

    expect(updated.meta).toEqual({
      createdAt: target.meta.createdAt,
      updatedAt: '2030-01-02T03:04:05.000Z',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run apps/api/test/product-update.test.ts`
Expected: FAIL (`PATCH` returns `404 Route not found`; `service.update` is not a function).

- [ ] **Step 3: Implement the repository methods**

In `product-repository.ts`: add `ne` to the `drizzle-orm` import, add the type, change `skuExists`, add `update`.

```ts
export interface ProductChanges {
  title?: string | undefined;
  description?: string | undefined;
  categoryId?: number | undefined;
  price?: number | undefined;
  stock?: number | undefined;
  brand?: string | undefined;
  sku?: string | undefined;
  weight?: number | undefined;
  updatedAt: string;
}

// inside createProductRepository's returned object:
/** True when a product other than `exceptId` (when given) already uses this sku. */
skuExists(sku: string, exceptId?: number): boolean {
  return (
    db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.sku, sku), exceptId === undefined ? undefined : ne(products.id, exceptId)))
      .get() !== undefined
  );
},

/** Writes the given columns (undefined ones are skipped). Returns whether a row matched. */
update(id: number, changes: ProductChanges): boolean {
  return db.update(products).set(changes).where(eq(products.id, id)).run().changes > 0;
},
```

(The existing `skuExists(sku)` body is replaced by the version above; `create` keeps calling it with one argument.)

- [ ] **Step 4: Implement the service method**

```ts
// product-service.ts — add PatchProductInput to the '@catalog/shared' type imports
// inside createProductService's returned object:
update(id: number, patch: PatchProductInput): Product {
  if (!repository.findById(id)) throw new NotFoundError(`Product ${id} not found`);

  const { category, ...fields } = patch;
  let categoryId: number | undefined;
  if (category !== undefined) {
    categoryId = repository.findCategoryId(category);
    if (categoryId === undefined) {
      throw new ValidationError('Invalid product payload', [
        { path: 'category', message: `"${category}" is not an existing category` },
      ]);
    }
  }
  if (fields.sku !== undefined && repository.skuExists(fields.sku, id)) {
    throw new ConflictError(`A product with SKU "${fields.sku}" already exists`, [
      { path: 'sku', message: 'is already in use' },
    ]);
  }

  repository.update(id, { ...fields, categoryId, updatedAt: now().toISOString() });
  return get(id);
},
```

- [ ] **Step 5: Implement the route**

```ts
// routes/products.ts — add patchProductSchema to the '@catalog/shared' import
routes.patch('/:id', async (c) => {
  const { id } = productIdParamSchema.parse(c.req.param());
  const patch = patchProductSchema.parse(await readJsonBody(c));
  return c.json({ data: service.update(id, patch) });
});
```

- [ ] **Step 6: Mark the operation implemented in the OpenAPI test**

In `apps/api/test/openapi.test.ts`, add `'PATCH /api/products/{id}'` to `IMPLEMENTED_OPERATIONS`. Do not touch the "flips an operation on" test yet (Task 2 does).

- [ ] **Step 7: Run to verify everything passes**

Run: `pnpm exec vitest run apps/api && pnpm typecheck && pnpm lint`
Expected: PASS. If `typecheck` rejects the `update` call because of `exactOptionalPropertyTypes`, add `| undefined` to the offending optional in `ProductChanges` rather than casting.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "feat: add PATCH /api/products/:id"
```

---

### Task 2: `DELETE /api/products/:id`

**Files:**
- Modify: `apps/api/src/repositories/product-repository.ts`
- Modify: `apps/api/src/services/product-service.ts`
- Modify: `apps/api/src/routes/products.ts`
- Modify: `apps/api/test/openapi.test.ts`
- Test: `apps/api/test/product-delete.test.ts`

**Interfaces:**
- Consumes: `productIdParamSchema`; `NotFoundError`; `ProductRepository.findById` (B-07).
- Produces:
  - `ProductRepository.delete(id: number): boolean` (true when a row was removed)
  - `ProductService.delete(id: number): void` (throws `NotFoundError('Product <id> not found')`)
  - Route `DELETE /api/products/:id` -> `204` with an empty body; `404 NOT_FOUND`; `400 VALIDATION_ERROR`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/test/product-delete.test.ts
import type { ErrorResponse, ItemResponse, ListResponse, Product } from '@catalog/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { categories } from '../src/db/schema.js';
import { loadSeedData, seedDatabase } from '../src/db/seed.js';
import { createTestDb, type TestDb } from './helpers.js';

const seed = loadSeedData();
const target = seed[0]!;
const seededCategoryCount = new Set(seed.map((product) => product.category)).size;

describe('DELETE /api/products/:id', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  const remove = (id: number | string) => app.request(`/api/products/${id}`, { method: 'DELETE' });
  const total = async () =>
    ((await (await app.request('/api/products')).json()) as ListResponse<Product>).meta.total;

  beforeEach(() => {
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
    app = createApp({ db: testDb.db });
  });
  afterEach(() => testDb.cleanup());

  it('answers 204 with an empty body and removes the product', async () => {
    const res = await remove(target.id);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect((await app.request(`/api/products/${target.id}`)).status).toBe(404);
    expect(await total()).toBe(seed.length - 1);
  });

  it('answers 404 NOT_FOUND to a second delete of the same id', async () => {
    await remove(target.id);
    const res = await remove(target.id);
    const body = (await res.json()) as ErrorResponse;

    expect(res.status).toBe(404);
    expect(body.error).toEqual({ code: 'NOT_FOUND', message: `Product ${target.id} not found` });
  });

  it('answers 404 for an unknown id', async () => {
    expect((await remove(999999)).status).toBe(404);
    expect(await total()).toBe(seed.length);
  });

  it.each(['abc', '1.5', '0', '-1'])('answers 400 VALIDATION_ERROR for the id "%s"', async (id) => {
    const res = await remove(id);
    const body = (await res.json()) as ErrorResponse;

    expect(res.status).toBe(400);
    expect(body.error.details?.map((detail) => detail.path)).toEqual(['id']);
    expect(await total()).toBe(seed.length);
  });

  it('leaves the other products and the categories alone', async () => {
    await remove(target.id);

    const second = seed[1]!;
    const read = await app.request(`/api/products/${second.id}`);
    expect(((await read.json()) as ItemResponse<Product>).data).toEqual(second);
    expect(testDb.db.select().from(categories).all()).toHaveLength(seededCategoryCount);
  });

  it('frees the sku for a new product', async () => {
    await remove(target.id);

    const { id: _id, meta: _meta, ...input } = target;
    const res = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    expect(res.status).toBe(201);
  });
});
```

(If ESLint objects to the unused `_id` / `_meta`, build the input explicitly from `target.title`, `target.description`, and so on instead.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run apps/api/test/product-delete.test.ts`
Expected: FAIL (`DELETE` returns `404 Route not found` for every case, so the `204` test fails).

- [ ] **Step 3: Implement the repository method**

```ts
// inside createProductRepository's returned object:
/** Removes the product. Returns whether a row was removed. */
delete(id: number): boolean {
  return db.delete(products).where(eq(products.id, id)).run().changes > 0;
},
```

- [ ] **Step 4: Implement the service method**

```ts
// inside createProductService's returned object:
delete(id: number): void {
  if (!repository.delete(id)) throw new NotFoundError(`Product ${id} not found`);
},
```

- [ ] **Step 5: Implement the route**

```ts
routes.delete('/:id', (c) => {
  const { id } = productIdParamSchema.parse(c.req.param());
  service.delete(id);
  return c.body(null, 204);
});
```

- [ ] **Step 6: Update `openapi.test.ts`**

Add `'DELETE /api/products/{id}'` to `IMPLEMENTED_OPERATIONS`. Then rewrite the "flips an operation on as soon as its route is registered, and only that one" test, because both products operations it used are now real:

```ts
  it('flips an operation on as soon as its route is registered, and only that one', async () => {
    const app = newApp();
    app.get('/api/categories', (c) => c.json({ data: [] }));

    const ops = operations(await fetchDoc(app));

    expect(ops.get('GET /api/categories')?.['x-implemented']).toBe(true);
    expect(ops.get('GET /api/categories')?.description).not.toMatch(/Not implemented yet/);
    expect(ops.get('POST /api/categories')?.['x-implemented']).toBe(false);
  });
```

- [ ] **Step 7: Run to verify everything passes**

Run: `pnpm exec vitest run apps/api && pnpm typecheck && pnpm lint`
Expected: PASS, including the "describes every route the real app registers" test.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "feat: add DELETE /api/products/:id"
```

---

### Task 3: Web pure logic — form helpers and `reloadAfterDelete`

**Files:**
- Modify: `apps/web/src/lib/product-form.ts`
- Modify: `apps/web/test/product-form.test.ts`
- Modify: `apps/web/src/lib/stores/catalog.svelte.ts`
- Modify: `apps/web/test/catalog.test.ts`

**Interfaces:**
- Consumes: `Product`, `PatchProductInput`, `CreateProductInput` from `@catalog/shared`; `FORM_FIELDS`, `ProductFormValues`, `EMPTY_VALUES` (B-07); `CatalogStore.update`, `CatalogStore.load`, `DEFAULT_PARAMS` (existing).
- Produces:
  - `valuesFromProduct(product: Product): ProductFormValues` — every form field as a string (`price: 9.99` -> `'9.99'`).
  - `changedFields(original: Product, input: CreateProductInput): PatchProductInput` — only the fields whose value differs from `original`; `{}` when nothing changed.
  - `CatalogStore.reloadAfterDelete(): Promise<void>` — when the deleted row was the only one on a page after the first, loads the previous page (`update({ page: page - 1 })`); otherwise reloads the current page (`load()`).

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/product-form.test.ts` (extend its imports with `changedFields` and `valuesFromProduct`, and add `import type { Product } from '@catalog/shared';`):

```ts
const stored: Product = {
  id: 5,
  title: 'Rocket Skates',
  description: 'Blast off.',
  category: 'automotive',
  price: 19.99,
  stock: 3,
  brand: 'ACME',
  sku: 'ACM-1',
  weight: 2.5,
  meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
};

describe('valuesFromProduct', () => {
  it('turns every form field into the string a user would have typed', () => {
    expect(valuesFromProduct(stored)).toEqual({
      title: 'Rocket Skates',
      description: 'Blast off.',
      category: 'automotive',
      brand: 'ACME',
      sku: 'ACM-1',
      price: '19.99',
      stock: '3',
      weight: '2.5',
    });
  });

  it('round-trips through the form validation to the same values', () => {
    const result = validateProductForm(valuesFromProduct(stored));

    expect(result).toMatchObject({
      ok: true,
      input: { price: 19.99, stock: 3, weight: 2.5, title: 'Rocket Skates' },
    });
  });
});

describe('changedFields', () => {
  function inputFrom(overrides: Record<string, unknown> = {}) {
    const result = validateProductForm({ ...valuesFromProduct(stored), ...overrides });
    if (!result.ok) throw new Error('expected a valid form');
    return result.input;
  }

  it('is empty when nothing changed', () => {
    expect(changedFields(stored, inputFrom())).toEqual({});
  });

  it('holds only the fields that changed', () => {
    expect(changedFields(stored, inputFrom({ price: '7.5', stock: '0' }))).toEqual({
      price: 7.5,
      stock: 0,
    });
  });

  it('does not count a number typed differently as a change', () => {
    expect(changedFields(stored, inputFrom({ price: '19.990', weight: '2.50' }))).toEqual({});
  });

  it('treats surrounding whitespace in a trimmed field as no change', () => {
    expect(changedFields(stored, inputFrom({ title: '  Rocket Skates  ' }))).toEqual({});
  });

  it('includes a changed category and sku', () => {
    expect(changedFields(stored, inputFrom({ category: 'tools', sku: 'ACM-2' }))).toEqual({
      category: 'tools',
      sku: 'ACM-2',
    });
  });
});
```

Add to `apps/web/test/catalog.test.ts` (add `import { DEFAULT_PARAMS } from '../src/lib/query-params.js';`), inside or after the existing `describe('CatalogStore', ...)`:

```ts
describe('CatalogStore.reloadAfterDelete', () => {
  // `page(...)` is the response builder defined at the top of this file.
  function storeOn(pageNumber: number, products: Product[]) {
    const fetchMock = vi.fn(async (_url: string) => json(page(products)));
    vi.stubGlobal('fetch', fetchMock);
    const store = new CatalogStore();
    store.params = { ...DEFAULT_PARAMS, page: pageNumber };
    store.products = products;
    return { store, fetchMock };
  }

  it('steps back a page when the last row of a page after the first was deleted', async () => {
    const { store, fetchMock } = storeOn(2, [product(31)]);

    await store.reloadAfterDelete();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products?page=1&pageSize=30');
    expect(store.params.page).toBe(1);
  });

  it('reloads the same page while it still has rows', async () => {
    const { store, fetchMock } = storeOn(2, [product(31), product(32)]);

    await store.reloadAfterDelete();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products?page=2&pageSize=30');
    expect(store.params.page).toBe(2);
  });

  it('stays on page 1 when its only row was deleted', async () => {
    const { store, fetchMock } = storeOn(1, [product(1)]);

    await store.reloadAfterDelete();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products?page=1&pageSize=30');
    expect(store.params.page).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run apps/web/test/product-form.test.ts apps/web/test/catalog.test.ts`
Expected: FAIL (`valuesFromProduct`, `changedFields` and `reloadAfterDelete` are not defined).

- [ ] **Step 3: Implement the form helpers**

Add `type Product` and `type PatchProductInput` to the `@catalog/shared` imports of `product-form.ts`, then append:

```ts
/** The form's initial values for editing: every field as the string a user would have typed. */
export function valuesFromProduct(product: Product): ProductFormValues {
  return {
    title: product.title,
    description: product.description,
    category: product.category,
    brand: product.brand,
    sku: product.sku,
    price: String(product.price),
    stock: String(product.stock),
    weight: String(product.weight),
  };
}

/** The fields of `input` that differ from the stored product; `{}` when nothing changed. */
export function changedFields(original: Product, input: CreateProductInput): PatchProductInput {
  const patch: Record<string, unknown> = {};
  for (const field of FORM_FIELDS) {
    if (original[field] !== input[field]) patch[field] = input[field];
  }
  // Every key is a field of the patch schema and every value came from the validated input.
  return patch as PatchProductInput;
}
```

- [ ] **Step 4: Implement `reloadAfterDelete`**

In `catalog.svelte.ts`, after `applyParams`:

```ts
  /**
   * Refreshes the list after a product was deleted. If that was the only row on a page after the
   * first, that page no longer exists, so step back one instead of showing an empty page.
   */
  reloadAfterDelete(): Promise<void> {
    const wasLastRow = this.products.length === 1 && this.params.page > 1;
    return wasLastRow ? this.update({ page: this.params.page - 1 }) : this.load();
  }
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm exec vitest run apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib apps/web/test
git commit -m "feat: add the edit-form helpers and the post-delete list reload"
```

---

### Task 4: Dialog store — edit and delete flows

**Files:**
- Modify: `apps/web/src/lib/stores/product-dialog.svelte.ts`
- Modify: `apps/web/test/product-dialog.test.ts`

**Interfaces:**
- Consumes: `api.patch<T>(path, body)`, `api.delete(path)`, `ApiError` (`lib/api.ts`); `changedFields` (Task 3); `CatalogStore.load`, `.update`, `.reloadAfterDelete`.
- Produces (exported from `product-dialog.svelte.ts`):
  - `DialogView` gains `{ kind: 'edit'; product: Product }` and `{ kind: 'delete'; product: Product }`
  - `type DeleteStatus = 'idle' | 'pending' | 'error'`
  - `ProductDialogStore` gains reactive fields `deleteStatus: DeleteStatus` and `deleteError: ApiError | null`, and methods:
    - `openEdit(): void` and `openDelete(): void` — only from a `detail` view whose refresh is not in flight (`detailStatus !== 'loading'`); otherwise a no-op. `openDelete` resets `deleteStatus` to `'idle'` and `deleteError` to `null`.
    - `backToDetail(): void` — from `edit` or `delete`, returns to `detail` with the same product (no refetch); otherwise a no-op.
    - `update(input: CreateProductInput): Promise<void>` — only from an `edit` view. Sends `PATCH /products/:id` with **only the changed fields**; when nothing changed it sends nothing. On success it reloads the list (`catalog.load()`) and shows the returned product in `detail` (unless the modal was closed or moved to another product meanwhile). On failure it **rejects with the `ApiError`** and leaves the edit view untouched.
    - `remove(): Promise<void>` — only from a `delete` view and not while `deleteStatus === 'pending'`. Sends `DELETE /products/:id`. On success it closes the modal and calls `catalog.reloadAfterDelete()`. On failure it sets `deleteStatus = 'error'` and `deleteError`, and stays in the `delete` view (it does **not** reject).
  - Constructor type widens to `new ProductDialogStore(catalog: Pick<CatalogStore, 'update' | 'load' | 'reloadAfterDelete'>)`. `openDetail`, `openCreate`, `close`, `create` are unchanged.

- [ ] **Step 1: Widen `setup()` and write the failing tests**

In `apps/web/test/product-dialog.test.ts`, replace `setup()` so the fake catalog has all three methods (existing tests only use `update`):

```ts
function setup() {
  const catalog = {
    update: vi.fn(async () => {}),
    load: vi.fn(async () => {}),
    reloadAfterDelete: vi.fn(async () => {}),
  };
  return { catalog, store: new ProductDialogStore(catalog) };
}

function inputOf(p: Product) {
  return {
    title: p.title,
    description: p.description,
    category: p.category,
    price: p.price,
    stock: p.stock,
    brand: p.brand,
    sku: p.sku,
    weight: p.weight,
  };
}

/** A store already showing `p` in the detail view, without going through a fetch. */
function showing(p: Product) {
  const made = setup();
  made.store.view = { kind: 'detail', product: p };
  return made;
}
```

Then append these blocks inside the top-level `describe('ProductDialogStore', ...)`:

```ts
  describe('openEdit and openDelete', () => {
    it('move from the detail view to the edit and delete views, and back', () => {
      const { store } = showing(product(5));

      store.openEdit();
      expect(store.view).toEqual({ kind: 'edit', product: product(5) });
      store.backToDetail();
      expect(store.view).toEqual({ kind: 'detail', product: product(5) });

      store.openDelete();
      expect(store.view).toEqual({ kind: 'delete', product: product(5) });
      store.backToDetail();
      expect(store.view).toEqual({ kind: 'detail', product: product(5) });
    });

    it('do nothing outside the detail view', () => {
      const { store } = setup();

      store.openEdit();
      store.openDelete();
      store.backToDetail();

      expect(store.view).toEqual({ kind: 'closed' });
    });

    it('wait for the detail refresh to finish, so edits start from the server copy', async () => {
      const reply = deferred<Response>();
      vi.stubGlobal(
        'fetch',
        vi.fn(() => reply.promise),
      );
      const { store } = setup();

      const opening = store.openDetail(product(5));
      store.openEdit();
      store.openDelete();
      expect(store.view.kind).toBe('detail');

      reply.resolve(json(item(product(5))));
      await opening;
      store.openEdit();
      expect(store.view.kind).toBe('edit');
    });

    it('openDelete clears an earlier delete error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }, 500)),
      );
      const { store } = showing(product(5));
      store.openDelete();
      await store.remove();
      expect(store.deleteStatus).toBe('error');

      store.backToDetail();
      store.openDelete();

      expect(store.deleteStatus).toBe('idle');
      expect(store.deleteError).toBeNull();
    });
  });

  describe('update', () => {
    it('sends only the changed fields, reloads the list and shows the updated product', async () => {
      const original = product(5);
      const updated = product(5, {
        price: 12.5,
        meta: { createdAt: original.meta.createdAt, updatedAt: '2026-02-01T00:00:00.000Z' },
      });
      const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(item(updated)));
      vi.stubGlobal('fetch', fetchMock);
      const { store, catalog } = showing(original);
      store.openEdit();

      await store.update({ ...inputOf(original), price: 12.5 });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('/api/products/5');
      expect(init?.method).toBe('PATCH');
      expect(JSON.parse(String(init?.body))).toEqual({ price: 12.5 });
      expect(catalog.load).toHaveBeenCalledOnce();
      expect(store.view).toEqual({ kind: 'detail', product: updated });
      expect(store.detailStatus).toBe('ready');
    });

    it('sends nothing when no field changed, and goes back to the detail view', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { store, catalog } = showing(product(5));
      store.openEdit();

      await store.update(inputOf(product(5)));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(catalog.load).not.toHaveBeenCalled();
      expect(store.view).toEqual({ kind: 'detail', product: product(5) });
    });

    it('rejects with the ApiError and stays in the edit view when the server refuses', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          json(
            {
              error: {
                code: 'CONFLICT',
                message: 'A product with SKU "SKU-9" already exists',
                details: [{ path: 'sku', message: 'is already in use' }],
              },
            },
            409,
          ),
        ),
      );
      const { store, catalog } = showing(product(5));
      store.openEdit();

      const failure = await store
        .update({ ...inputOf(product(5)), sku: 'SKU-9' })
        .catch((cause: unknown) => cause);

      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).details).toEqual([
        { path: 'sku', message: 'is already in use' },
      ]);
      expect(store.view).toEqual({ kind: 'edit', product: product(5) });
      expect(catalog.load).not.toHaveBeenCalled();
    });

    it('does not reopen the modal if it was closed while the request was in flight', async () => {
      const reply = deferred<Response>();
      vi.stubGlobal(
        'fetch',
        vi.fn(() => reply.promise),
      );
      const { store } = showing(product(5));
      store.openEdit();

      const updating = store.update({ ...inputOf(product(5)), stock: 1 });
      store.close();
      reply.resolve(json(item(product(5, { stock: 1 }))));
      await updating;

      expect(store.view).toEqual({ kind: 'closed' });
    });

    it('does nothing outside the edit view', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { store } = setup();

      await store.update(inputOf(product(5)));

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes, closes the modal and reloads the list', async () => {
      const fetchMock = vi.fn(
        async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { store, catalog } = showing(product(5));
      store.openDelete();

      await store.remove();

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('/api/products/5');
      expect(init?.method).toBe('DELETE');
      expect(store.view).toEqual({ kind: 'closed' });
      expect(catalog.reloadAfterDelete).toHaveBeenCalledOnce();
    });

    it('is pending while the request runs and ignores a second call', async () => {
      const reply = deferred<Response>();
      const fetchMock = vi.fn(() => reply.promise);
      vi.stubGlobal('fetch', fetchMock);
      const { store } = showing(product(5));
      store.openDelete();

      const removing = store.remove();
      expect(store.deleteStatus).toBe('pending');
      void store.remove();
      expect(fetchMock).toHaveBeenCalledOnce();

      reply.resolve(new Response(null, { status: 204 }));
      await removing;
      expect(store.deleteStatus).toBe('idle');
    });

    it('records the error and stays in the delete view when the server refuses', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          json({ error: { code: 'NOT_FOUND', message: 'Product 5 not found' } }, 404),
        ),
      );
      const { store, catalog } = showing(product(5));
      store.openDelete();

      await store.remove();

      expect(store.view).toEqual({ kind: 'delete', product: product(5) });
      expect(store.deleteStatus).toBe('error');
      expect(store.deleteError?.code).toBe('NOT_FOUND');
      expect(catalog.reloadAfterDelete).not.toHaveBeenCalled();
    });

    it('reports an unreachable server', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('fetch failed');
        }),
      );
      const { store } = showing(product(5));
      store.openDelete();

      await store.remove();

      expect(store.deleteStatus).toBe('error');
      expect(store.deleteError?.code).toBe('NETWORK_ERROR');
    });

    it('does nothing outside the delete view', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { store } = showing(product(5));

      await store.remove();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run apps/web/test/product-dialog.test.ts`
Expected: FAIL (`openEdit` and the other new methods do not exist; the existing tests still pass with the widened `setup()`).

- [ ] **Step 3: Implement**

In `product-dialog.svelte.ts`: import `changedFields` from `'../product-form.js'`; widen the types and constructor; add the fields and methods.

```ts
export type DialogView =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'detail'; product: Product }
  | { kind: 'edit'; product: Product }
  | { kind: 'delete'; product: Product };

export type DeleteStatus = 'idle' | 'pending' | 'error';

type CatalogActions = Pick<CatalogStore, 'update' | 'load' | 'reloadAfterDelete'>;
```

Inside the class (also change `#catalog` and the constructor parameter to `CatalogActions`):

```ts
  deleteStatus = $state<DeleteStatus>('idle');
  deleteError = $state<ApiError | null>(null);

  /** Editing starts from the server's copy, so wait until the detail refresh has landed. */
  openEdit(): void {
    if (this.view.kind !== 'detail' || this.detailStatus === 'loading') return;
    this.view = { kind: 'edit', product: this.view.product };
  }

  openDelete(): void {
    if (this.view.kind !== 'detail' || this.detailStatus === 'loading') return;
    this.deleteStatus = 'idle';
    this.deleteError = null;
    this.view = { kind: 'delete', product: this.view.product };
  }

  backToDetail(): void {
    if (this.view.kind !== 'edit' && this.view.kind !== 'delete') return;
    this.view = { kind: 'detail', product: this.view.product };
  }

  /**
   * Saves the edit, sending only the fields that changed. A refusal rejects with the `ApiError`
   * so the form can map its `details` onto fields. On success the list is reloaded and the modal
   * shows the updated product, unless it was closed or moved to another product in the meantime.
   */
  async update(input: CreateProductInput): Promise<void> {
    const current = this.view;
    if (current.kind !== 'edit') return;

    const patch = changedFields(current.product, input);
    let product = current.product;
    if (Object.keys(patch).length > 0) {
      product = await api.patch<Product>(`/products/${product.id}`, patch);
      await this.#catalog.load();
    }

    if (this.view.kind !== 'edit' || this.view.product.id !== product.id) return;
    this.view = { kind: 'detail', product };
    this.detailStatus = 'ready';
    this.detailError = null;
  }

  /** Deletes the product shown in the confirmation view. A failure is recorded, not thrown. */
  async remove(): Promise<void> {
    const current = this.view;
    if (current.kind !== 'delete' || this.deleteStatus === 'pending') return;

    this.deleteStatus = 'pending';
    this.deleteError = null;
    try {
      await api.delete(`/products/${current.product.id}`);
    } catch (cause) {
      this.deleteError =
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
      this.deleteStatus = 'error';
      return;
    }

    this.deleteStatus = 'idle';
    if (this.view.kind === 'delete' && this.view.product.id === current.product.id) this.close();
    await this.#catalog.reloadAfterDelete();
  }
```

`openDetail`'s `catch` block already builds the same `ApiError` fallback; if you want, extract a private `#toApiError(cause: unknown): ApiError` and use it in all three places (optional).

- [ ] **Step 4: Run to verify it passes, plus typecheck**

Run: `pnpm exec vitest run apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/product-dialog.svelte.ts apps/web/test/product-dialog.test.ts
git commit -m "feat: add the edit and delete flows to the dialog store"
```

---

### Task 5: Components, wiring and browser check

No automated tests (see Global Constraints); the logic they call is covered in Tasks 3 and 4. Verification is `pnpm typecheck`, `pnpm lint`, and the manual check in Step 6.

**Files:**
- Modify: `apps/web/src/components/ProductForm.svelte`, `apps/web/src/views/ProductDetail.svelte`, `apps/web/src/views/ProductDialog.svelte`
- Create: `apps/web/src/views/ProductDeleteConfirm.svelte`

**Interfaces:**
- Consumes: `productDialog`, `DialogView`, `DetailStatus`, `DeleteStatus` (Task 4); `valuesFromProduct`, `EMPTY_VALUES`, `validateProductForm`, `detailsToFieldErrors` (Tasks 3 and B-07); `ApiError`; `Product`, `CreateProductInput` from `@catalog/shared`.
- Produces: `ProductForm` props `{ product?: Product; onsubmit: (input: CreateProductInput) => Promise<void>; oncancel: () => void }`; `ProductDetail` gains props `onedit: () => void` and `ondelete: () => void`; `ProductDeleteConfirm` props `{ product: Product; status: DeleteStatus; error: ApiError | null; onconfirm: () => void; oncancel: () => void }`.

- [ ] **Step 1: `ProductForm.svelte` becomes the create and edit form**

Change the props, the initial values and the two labels; add first-field focus on mount (views switch inside one open modal, so the browser's automatic focus on open does not apply).

```svelte
  import type { CreateProductInput, Product } from '@catalog/shared';
  // ...existing imports, plus valuesFromProduct from '../lib/product-form.js'

  let {
    product,
    onsubmit,
    oncancel,
  }: {
    product?: Product;
    onsubmit: (input: CreateProductInput) => Promise<void>;
    oncancel: () => void;
  } = $props();

  // The form is filled in once, when it opens; later changes to `product` must not overwrite what
  // the user is typing.
  // svelte-ignore state_referenced_locally
  let values = $state<ProductFormValues>(product ? valuesFromProduct(product) : { ...EMPTY_VALUES });

  const editing = $derived(product !== undefined);

  $effect(() => {
    form.querySelector<HTMLElement>('input, textarea')?.focus();
  });
```

In the markup, replace the submit button label:

```svelte
      {#if pending}
        {editing ? 'Saving…' : 'Creating…'}
      {:else}
        {editing ? 'Save changes' : 'Create product'}
      {/if}
```

Keep everything else (validation, `detailsToFieldErrors` mapping, the banner) as it is. If `svelte-check` reports no warning without the `svelte-ignore state_referenced_locally` line, delete that line and keep only the explanatory comment.

- [ ] **Step 2: `ProductDetail.svelte` enables the buttons**

Add `onedit` and `ondelete` to the props type and destructuring; replace the two disabled buttons:

```svelte
<div class="mt-6 flex justify-end gap-3">
  <button
    type="button"
    class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
    disabled={status === 'loading'}
    onclick={onedit}
  >
    Edit
  </button>
  <button
    type="button"
    class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
    disabled={status === 'loading'}
    onclick={ondelete}
  >
    Delete
  </button>
</div>
```

- [ ] **Step 3: `ProductDeleteConfirm.svelte`**

Cancel takes focus when the panel opens: the safe default for a destructive step.

```svelte
<script lang="ts">
  import type { Product } from '@catalog/shared';
  import type { ApiError } from '../lib/api.js';
  import type { DeleteStatus } from '../lib/stores/product-dialog.svelte.js';

  let {
    product,
    status,
    error,
    onconfirm,
    oncancel,
  }: {
    product: Product;
    status: DeleteStatus;
    error: ApiError | null;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  let cancelButton: HTMLButtonElement;

  $effect(() => {
    cancelButton.focus();
  });
</script>

<div>
  <p class="text-sm text-slate-700">
    Delete <strong class="break-words">{product.title}</strong> ({product.sku})? This removes the
    product permanently and cannot be undone.
  </p>

  {#if status === 'error'}
    <p
      role="alert"
      class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      Could not delete this product: {error?.message}
    </p>
  {/if}

  <div class="mt-6 flex justify-end gap-3">
    <button
      bind:this={cancelButton}
      type="button"
      class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
      disabled={status === 'pending'}
      onclick={oncancel}
    >
      Cancel
    </button>
    <button
      type="button"
      class="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
      disabled={status === 'pending'}
      onclick={onconfirm}
    >
      {status === 'pending' ? 'Deleting…' : 'Delete product'}
    </button>
  </div>
</div>
```

- [ ] **Step 4: `ProductDialog.svelte` renders the new views**

```svelte
<script lang="ts">
  import Modal from '../components/Modal.svelte';
  import ProductForm from '../components/ProductForm.svelte';
  import { productDialog } from '../lib/stores/product-dialog.svelte.js';
  import ProductDeleteConfirm from './ProductDeleteConfirm.svelte';
  import ProductDetail from './ProductDetail.svelte';

  const titles = {
    create: () => 'New product',
    detail: (title: string) => title,
    edit: (title: string) => `Edit ${title}`,
    delete: () => 'Delete product',
  };
</script>

{#if productDialog.view.kind !== 'closed'}
  {@const view = productDialog.view}
  <Modal
    title={view.kind === 'create'
      ? titles.create()
      : view.kind === 'delete'
        ? titles.delete()
        : titles[view.kind](view.product.title)}
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
        onedit={() => productDialog.openEdit()}
        ondelete={() => productDialog.openDelete()}
      />
    {:else if view.kind === 'edit'}
      <ProductForm
        product={view.product}
        onsubmit={(input) => productDialog.update(input)}
        oncancel={() => productDialog.backToDetail()}
      />
    {:else if view.kind === 'delete'}
      <ProductDeleteConfirm
        product={view.product}
        status={productDialog.deleteStatus}
        error={productDialog.deleteError}
        onconfirm={() => void productDialog.remove()}
        oncancel={() => productDialog.backToDetail()}
      />
    {/if}
  </Modal>
{/if}
```

The nested title ternary is ugly: if it does not read well, replace `titles` with a small function `titleFor(view)` in the script block. Behaviour, not shape, is what matters: `New product` / product title / `Edit <title>` / `Delete product`.

**Important:** the edit form must be a *fresh* instance each time it opens, otherwise it keeps stale values. It is, because the `{#if}` branches differ (`detail` -> `edit` unmounts and mounts `ProductForm`), and creating from `create` also remounts. Do not hoist a shared `ProductForm` above the branches.

- [ ] **Step 5: Verify statically**

Run: `pnpm exec prettier --write apps/web/src && pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS. Fix any `svelte-check` a11y warning by following its message, not by removing the accessibility affordance.

- [ ] **Step 6: Verify in the browser (use the `run` skill or Playwright)**

Use a throwaway database so your dev data is untouched: `DATABASE_PATH=<temp path>` for both `pnpm db:seed` and `pnpm dev`. Open `http://localhost:5173`. Check each, and note anything that fails:
1. Open a product: Edit and Delete are enabled once "Refreshing…" has gone.
2. **Edit:** click Edit. The modal title becomes `Edit <title>`, every field is pre-filled (price and weight as plain numbers), focus is on Title, and the button reads "Save changes".
3. Change only the price to `12.5` and save. Watch the network: the `PATCH` body is exactly `{"price":12.5}`. The modal returns to the detail view showing `$12.50` and a newer "Updated" time, "Created" unchanged, and the row behind it shows the new price without a page reload.
4. Edit again and save without changing anything: no `PATCH` is sent and the modal returns to the detail view.
5. Edit, then Cancel: back to the detail view with the original values, no request.
6. Edit and set the SKU to another product's SKU (see any row): the error appears **under SKU**, not as a banner; the modal stays in edit with your other changes kept. Set category to `nope`: the error appears **under Category**. Set price to `-1`: `must be >= 0` under Price with no request sent.
7. Edit, change the SKU to a fresh value, save: succeeds. Edit again and re-save the same SKU as-is with another field changed: succeeds (own sku is not a conflict).
8. **Delete:** click Delete. The panel names the product and SKU, focus is on **Cancel**, and nothing has been deleted yet. Cancel returns to the detail view. Escape from the panel closes the whole modal without deleting.
9. Confirm the delete: the button shows "Deleting…" while pending, then the modal closes, the product is gone from the list, and `Showing 1–30 of 35 products` (one fewer than before).
10. **Last row of a page:** from a fresh seed (36 products, default page size 30), delete products 32 to 36 with `curl.exe -X DELETE http://localhost:3000/api/products/32` (and so on) so that product 31 is alone on page 2. Load `http://localhost:5173/?page=2` and delete product 31 through the UI: the list ends up on **page 1** (URL shows no `page`), not on an empty page 2.
11. Stop the API, then confirm a delete: the panel stays open with a red "Could not delete this product: ..." message and both buttons re-enabled. Restart the API and confirm again: it succeeds and the message is gone.
12. Stop the API, edit a product and save: a banner shows, the form stays open with values kept.
13. Confirm a deleted product is really gone: `curl.exe -i http://localhost:3000/api/products/<deleted id>` answers `404`.

Stop the dev servers and delete the temporary database when done.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat: add edit and delete to the product detail modal"
```

---

### Task 6: Docs and handoff

**Files:**
- Modify: `docs/technical-decisions.md`, `docs/backlog.md`

- [ ] **Step 1: Record the decisions in `docs/technical-decisions.md`** (the document is binding, so it changes in the same branch):
  - §3.2: `PATCH` order of checks (id -> JSON -> schema `400` -> `404` -> category `400` naming `category` -> sku owned by another product `409` with `details` naming `sku`); a product re-sending its own sku is not a conflict; only the fields present are written and `updatedAt` is refreshed; `DELETE` answers `204` with an empty body and `404` for an absent id, with no cascade (categories are untouched).
  - §2 layout: add `views/ProductDeleteConfirm.svelte`.
  - §5: Edit and Delete work inside the same modal (`detail` -> `edit` / `delete` -> back to `detail`); the edit form is pre-filled, sends only changed fields, and sends nothing when nothing changed; Edit and Delete wait for the detail refresh so edits start from the server's copy; the delete confirmation is an in-modal step with Cancel focused; after a delete the list reloads and steps back one page if the deleted row was the last on a page after the first.

- [ ] **Step 2: Backlog.** Mark B-10 `Done`, and delete the line B-07 added to B-10's Web section ("The detail modal's Edit and Delete buttons already exist, disabled (B-07); enable and wire them.").

- [ ] **Step 3: Final verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS. Record the test-file and test counts in your report (baseline: 22 files, 252 tests).

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: record the B-10 edit and delete decisions"
```

- [ ] **Step 5: Stop and hand back.** Do not merge or push to `main`. Report: branch name, commits, test counts, and anything from the manual check in Task 5 that could not be verified. Then, per `CLAUDE.md`, ask the user for their `AI.md` entry for this slice (invoke the `ai-log` skill); do not write it yourself.

---

## Self-Review

**Spec coverage (backlog B-10):**
- `PATCH` accepts any subset and returns `200` -> Task 1 tests ("changes the field...", category move, trim).
- `updatedAt` refreshed, `createdAt` untouched -> Task 1 (integration comparison against seeded 2025 timestamps and the injected-clock service test).
- Unknown id `404`; duplicate sku `409`; unknown category `400` naming `category` -> Task 1 tests, one each, plus the own-sku case.
- Integration test asserts both the field change and the bumped `updatedAt` -> Task 1 first test.
- `DELETE` `204` empty body; second delete `404` -> Task 2 tests.
- Edit reuses `ProductForm` pre-filled, no second form -> Task 5 Step 1 (`product` prop) and browser check 2.
- Only changed fields sent -> `changedFields` (Task 3), `update` (Task 4), browser checks 3-4.
- Detail modal and list both reflect the update without a full reload -> Task 4 `update` (returns product to the detail view, `catalog.load()`), browser check 3.
- Delete requires a confirmation step -> Task 4 views, Task 5 Step 3, browser check 8.
- On delete success the modal closes, list refreshes, stays on a valid page -> `remove` + `reloadAfterDelete` (Tasks 3-4), browser checks 9-10.
- Standing OpenAPI rule -> both operations already in `document.ts`; Tasks 1-2 add them to `IMPLEMENTED_OPERATIONS`; the "flips on" test is repointed so it does not assert the old unimplemented state.
- Pending and error states -> form `pending`/banner (existing), `deleteStatus`/`deleteError`, browser checks 11-12.

**Placeholder scan:** none; every code step has code. The two "if X, do Y" notes (`svelte-ignore`, optional `#toApiError`, title ternary) are explicit alternatives with a stated rule for choosing.

**Type consistency:** `ProductChanges`, `skuExists(sku, exceptId?)`, `ProductRepository.update/delete`, `ProductService.update/delete`, `valuesFromProduct`, `changedFields`, `CatalogStore.reloadAfterDelete`, `DialogView` (`edit` / `delete`), `DeleteStatus`, `ProductDialogStore.openEdit/openDelete/backToDetail/update/remove/deleteStatus/deleteError`, and the props of `ProductForm`, `ProductDetail` and `ProductDeleteConfirm` are named identically in every task that uses them.
