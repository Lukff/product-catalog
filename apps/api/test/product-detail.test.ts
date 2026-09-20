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
