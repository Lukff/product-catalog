import {
  LOW_STOCK_THRESHOLD,
  fromCents,
  isMoney,
  productStatsSchema,
  stockStatus,
  sumCents,
  toCents,
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

/** Expected stats with the value summed in integer cents, the way the API does it. */
function expectedStats(rows: { price: number; stock: number }[]): ProductStats {
  const count = (status: StockStatus) =>
    rows.filter((row) => stockStatus(row.stock) === status).length;
  return {
    total: rows.length,
    inStock: count('in'),
    lowStock: count('low'),
    outOfStock: count('out'),
    inventoryValue: fromCents(sumCents(rows.map((row) => toCents(row.price) * row.stock))),
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
    expect(body.data.inventoryValue).toBe(expected.inventoryValue);
  });

  it('has counts that add up to the total', async () => {
    const { body } = await stats();

    expect(body.data.inStock + body.data.lowStock + body.data.outOfStock).toBe(body.data.total);
  });

  it('reports an inventory value with at most 2 decimals', async () => {
    const { body } = await stats();

    expect(isMoney(body.data.inventoryValue)).toBe(true);
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
    expect(afterPatch.inventoryValue).toBe(
      fromCents(toCents(before.inventoryValue) + toCents(10) * LOW_STOCK_THRESHOLD),
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

describe('inventory value with prices whose float sum drifts', () => {
  let testDb: TestDb;

  beforeAll(() => {
    testDb = createTestDb();
  });
  afterAll(() => testDb.cleanup());

  it('is exact, and prices round-trip through create and read', async () => {
    const app = createApp({ db: testDb.db });
    const send = (url: string, body: unknown) =>
      app.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    await send('/api/categories', { slug: 'money' });
    await send('/api/brands', { name: 'Ledger' });

    // In floating point 0.1 + 0.2 is 0.30000000000000004 and 0.29 * 3 is 0.8699999999999999.
    const cases = [
      { sku: 'M-1', price: 0.1, stock: 1 },
      { sku: 'M-2', price: 0.2, stock: 1 },
      { sku: 'M-3', price: 0.29, stock: 3 },
      { sku: 'M-4', price: 1234567.89, stock: 7 },
    ];
    for (const { sku, price, stock } of cases) {
      const created = await send('/api/products', {
        title: sku,
        description: 'Money probe.',
        category: 'money',
        price,
        stock,
        brand: 'Ledger',
        sku,
        weight: 1,
      });
      const { data } = (await created.json()) as ItemResponse<Product>;
      expect(created.status).toBe(201);
      expect(data.price).toBe(price);

      const read = await app.request(`/api/products/${data.id}`);
      expect(((await read.json()) as ItemResponse<Product>).data.price).toBe(price);
    }

    const res = await app.request('/api/products/stats');
    const body = (await res.json()) as ItemResponse<ProductStats>;

    // 10 + 20 + 87 + 864197523 = 864197640 cents, exactly.
    expect(body.data.inventoryValue).toBe(8641976.4);
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
