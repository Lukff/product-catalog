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

    const input = {
      title: target.title,
      description: target.description,
      category: target.category,
      price: target.price,
      stock: target.stock,
      brand: target.brand,
      sku: target.sku,
      weight: target.weight,
    };
    const res = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    expect(res.status).toBe(201);
  });
});
