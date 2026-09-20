import {
  LOW_STOCK_THRESHOLD,
  productStatsSchema,
  stockStatus,
  type ErrorResponse,
  type ItemResponse,
  type ListResponse,
  type Product,
  type ProductStats,
  type StockStatus,
} from '@catalog/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadSeedData, seedDatabase } from '../src/db/seed.js';
import { createTestDb, type TestDb } from './helpers.js';

const seed = loadSeedData();

function expectedStats(rows: { price: number; stock: number }[]): ProductStats {
  const count = (status: StockStatus) =>
    rows.filter((row) => stockStatus(row.stock) === status).length;
  return {
    total: rows.length,
    inStock: count('in'),
    lowStock: count('low'),
    outOfStock: count('out'),
    inventoryValue: rows.reduce((sum, row) => sum + row.price * row.stock, 0),
  };
}

describe('GET /api/products/stats', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
    app = createApp({ db: testDb.db });
  });
  afterAll(() => testDb.cleanup());

  async function stats(query = '') {
    const res = await app.request(`/api/products/stats${query}`);
    return { res, body: (await res.json()) as ItemResponse<ProductStats> };
  }

  it('counts the catalog by stock status and matches the shared schema', async () => {
    const { res, body } = await stats();
    const expected = expectedStats(seed);

    expect(res.status).toBe(200);
    expect(productStatsSchema.safeParse(body.data).success).toBe(true);
    expect(body.data).toMatchObject({
      total: expected.total,
      inStock: expected.inStock,
      lowStock: expected.lowStock,
      outOfStock: expected.outOfStock,
    });
    expect(body.data.inventoryValue).toBeCloseTo(expected.inventoryValue, 2);
  });

  it('has counts that add up to the total', async () => {
    const { body } = await stats();

    expect(body.data.inStock + body.data.lowStock + body.data.outOfStock).toBe(body.data.total);
  });

  it('rounds the inventory value to 2 decimals', async () => {
    const { body } = await stats();

    expect(body.data.inventoryValue).toBe(Math.round(body.data.inventoryValue * 100) / 100);
  });

  it('agrees with stockStatus() at the boundaries 0, 1, the threshold and just above it', async () => {
    const stocks = new Set(seed.map((product) => product.stock));
    // Guard: the seed must actually sit on every boundary, or this test proves nothing.
    for (const boundary of [0, 1, LOW_STOCK_THRESHOLD, LOW_STOCK_THRESHOLD + 1]) {
      expect(stocks.has(boundary)).toBe(true);
    }

    const { body } = await stats();
    const expected = expectedStats(seed);

    expect(body.data.lowStock).toBe(expected.lowStock);
    expect(body.data.outOfStock).toBe(expected.outOfStock);
    expect(body.data.inStock).toBe(expected.inStock);
  });

  it('is catalog-wide: search and category params do not scope it', async () => {
    const plain = await stats();
    const scoped = await stats('?category=kitchen&q=zzzz&stockStatus=out');

    expect(scoped.res.status).toBe(200);
    expect(scoped.body).toEqual(plain.body);
  });

  it('is served by its own route, not parsed as a product id', async () => {
    const { res } = await stats();

    expect(res.status).toBe(200);
  });

  it('reflects creates, edits and deletes', async () => {
    const before = (await stats()).body.data;
    const category = seed[0]!.category;

    const created = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Stats Probe',
        description: 'Created by the stats test.',
        category,
        price: 10,
        stock: 0,
        brand: 'ACME',
        sku: 'STATS-PROBE-1',
        weight: 1,
      }),
    });
    const { data: product } = (await created.json()) as ItemResponse<Product>;

    const afterCreate = (await stats()).body.data;
    expect(afterCreate.total).toBe(before.total + 1);
    expect(afterCreate.outOfStock).toBe(before.outOfStock + 1);

    await app.request(`/api/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock: LOW_STOCK_THRESHOLD }),
    });
    const afterPatch = (await stats()).body.data;
    expect(afterPatch.outOfStock).toBe(before.outOfStock);
    expect(afterPatch.lowStock).toBe(before.lowStock + 1);
    expect(afterPatch.inventoryValue).toBeCloseTo(
      before.inventoryValue + 10 * LOW_STOCK_THRESHOLD,
      2,
    );

    await app.request(`/api/products/${product.id}`, { method: 'DELETE' });
    const afterDelete = (await stats()).body.data;
    expect(afterDelete).toEqual(before);
  });
});

describe('GET /api/products/stats on an empty catalog', () => {
  let testDb: TestDb;

  beforeAll(() => {
    testDb = createTestDb();
  });
  afterAll(() => testDb.cleanup());

  it('returns zeros, not an error or a null value', async () => {
    const app = createApp({ db: testDb.db });

    const res = await app.request('/api/products/stats');
    const body = (await res.json()) as ItemResponse<ProductStats>;

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      total: 0,
      inStock: 0,
      lowStock: 0,
      outOfStock: 0,
      inventoryValue: 0,
    });
  });
});

describe('GET /api/products?stockStatus=', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
    app = createApp({ db: testDb.db });
  });
  afterAll(() => testDb.cleanup());

  const expectedIds = (
    status: StockStatus,
    filter: (row: (typeof seed)[number]) => boolean = () => true,
  ) =>
    seed
      .filter((row) => stockStatus(row.stock) === status && filter(row))
      .map((row) => row.id)
      .sort((a, b) => a - b);

  async function list(query: string) {
    const res = await app.request(`/api/products?${query}`);
    return { res, body: (await res.json()) as ListResponse<Product> };
  }

  it.each(['out', 'low', 'in'] as const)(
    'returns only %s products and counts them',
    async (status) => {
      const expected = expectedIds(status);
      expect(expected.length).toBeGreaterThan(0);

      const { res, body } = await list(`stockStatus=${status}&pageSize=100`);

      expect(res.status).toBe(200);
      expect(body.data.map((product) => product.id)).toEqual(expected);
      expect(body.meta.total).toBe(expected.length);
      expect(body.data.every((product) => stockStatus(product.stock) === status)).toBe(true);
    },
  );

  it('composes with category', async () => {
    const expected = expectedIds('low', (row) => row.category === 'kitchen');
    const other = expectedIds('low', (row) => row.category !== 'kitchen');
    // Guard: the filters must each cut something, or the combination proves nothing.
    expect(other.length).toBeGreaterThan(0);

    const { body } = await list('stockStatus=low&category=kitchen&pageSize=100');

    expect(body.data.map((product) => product.id)).toEqual(expected);
    expect(body.meta.total).toBe(expected.length);
  });

  it('composes with q', async () => {
    const needle = 'a';
    const expected = expectedIds(
      'in',
      (row) =>
        row.title.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle),
    );

    const { body } = await list(`stockStatus=in&q=${needle}&pageSize=100`);

    expect(body.data.map((product) => product.id)).toEqual(expected);
    expect(body.meta.total).toBe(expected.length);
  });

  it('composes with sort and paging, with a consistent meta.total', async () => {
    const lowRows = seed.filter((row) => stockStatus(row.stock) === 'low');
    expect(lowRows.length).toBeGreaterThan(2);

    const byStockDesc = [...lowRows]
      .sort((a, b) => b.stock - a.stock || a.id - b.id)
      .map((row) => row.id);

    const first = await list('stockStatus=low&sort=-stock&pageSize=2&page=1');
    const second = await list('stockStatus=low&sort=-stock&pageSize=2&page=2');

    expect(first.body.data.map((product) => product.id)).toEqual(byStockDesc.slice(0, 2));
    expect(second.body.data.map((product) => product.id)).toEqual(byStockDesc.slice(2, 4));
    expect(first.body.meta).toEqual({
      page: 1,
      pageSize: 2,
      total: lowRows.length,
      totalPages: Math.ceil(lowRows.length / 2),
    });
  });

  it('returns an empty page when the combination matches nothing', async () => {
    const { res, body } = await list('stockStatus=out&category=no-such-category');

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it.each(['bogus', 'LOW', ''])('rejects %j with a 400 naming stockStatus', async (value) => {
    const res = await app.request(`/api/products?stockStatus=${value}`);
    const body = (await res.json()) as ErrorResponse;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.map((detail) => detail.path)).toContain('stockStatus');
  });
});
