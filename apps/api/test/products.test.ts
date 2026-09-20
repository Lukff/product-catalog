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
