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
    const list = (await (
      await app.request('/api/products?q=Renamed')
    ).json()) as ListResponse<Product>;
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
