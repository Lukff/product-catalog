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
