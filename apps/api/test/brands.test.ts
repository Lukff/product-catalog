import type { Brand, ErrorResponse, ItemResponse, ListResponse, Product } from '@catalog/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadSeedData, seedDatabase } from '../src/db/seed.js';
import { createTestDb, type TestDb } from './helpers.js';

const seed = loadSeedData();
const seededNames = [...new Set(seed.map((product) => product.brand))].sort();

describe('brands API', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  const json = (method: string, url: string, body: unknown) =>
    app.request(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const list = (query = '') => app.request(`/api/brands${query}`);
  const create = (body: unknown) => json('POST', '/api/brands', body);
  const remove = (name: string) =>
    app.request(`/api/brands/${encodeURIComponent(name)}`, { method: 'DELETE' });
  const names = async () =>
    ((await (await list('?pageSize=100')).json()) as ListResponse<Brand>).data.map(
      (brand) => brand.name,
    );
  const newProduct = (overrides: Record<string, unknown> = {}) => ({
    title: 'Rocket Skates',
    description: 'Fast.',
    category: seed[0]!.category,
    price: 9.99,
    stock: 3,
    brand: 'ACME',
    sku: 'BRAND-TEST-1',
    weight: 1,
    ...overrides,
  });

  beforeEach(() => {
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
    app = createApp({ db: testDb.db });
  });
  afterEach(() => testDb.cleanup());

  describe('GET /api/brands', () => {
    it('returns the paginated envelope, ordered by name, with only the name on the wire', async () => {
      const res = await list('?pageSize=100');
      const body = (await res.json()) as ListResponse<Brand>;

      expect(res.status).toBe(200);
      expect(body.data).toEqual(seededNames.map((name) => ({ name })));
      expect(body.meta).toEqual({
        page: 1,
        pageSize: 100,
        total: seededNames.length,
        totalPages: 1,
      });
    });

    it('pages through the brands without overlap', async () => {
      const first = (await (await list('?page=1&pageSize=2')).json()) as ListResponse<Brand>;
      const second = (await (await list('?page=2&pageSize=2')).json()) as ListResponse<Brand>;

      expect(first.data.map((b) => b.name)).toEqual(seededNames.slice(0, 2));
      expect(second.data.map((b) => b.name)).toEqual(seededNames.slice(2, 4));
      expect(first.meta.totalPages).toBe(Math.ceil(seededNames.length / 2));
    });

    it('answers 400 VALIDATION_ERROR for a bad page', async () => {
      const res = await list('?page=0');
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(400);
      expect(body.error.details?.map((detail) => detail.path)).toEqual(['page']);
    });
  });

  describe('POST /api/brands', () => {
    it('answers 201 with the new brand and lists it', async () => {
      const res = await create({ name: 'Acme Corp' });

      expect(res.status).toBe(201);
      expect(((await res.json()) as ItemResponse<Brand>).data).toEqual({ name: 'Acme Corp' });
      expect(await names()).toContain('Acme Corp');
    });

    it('trims the name and strips a client-sent id', async () => {
      const res = await create({ name: '  Wayne Enterprises ', id: 999 });

      expect(res.status).toBe(201);
      expect(((await res.json()) as ItemResponse<Brand>).data).toEqual({
        name: 'Wayne Enterprises',
      });
    });

    it('makes the brand usable as an empty filter', async () => {
      await create({ name: 'Acme Corp' });
      const res = await app.request('/api/products?brand=Acme%20Corp');

      expect(res.status).toBe(200);
      expect(((await res.json()) as ListResponse<Product>).meta.total).toBe(0);
    });

    it('answers 409 CONFLICT naming name for a duplicate, and adds nothing', async () => {
      const res = await create({ name: seededNames[0] });
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(409);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.details?.map((detail) => detail.path)).toEqual(['name']);
      expect(await names()).toEqual(seededNames);
    });

    it.each([{ name: '' }, { name: '   ' }, { name: 'x'.repeat(101) }, { name: 'AC/DC' }, {}])(
      'answers 400 VALIDATION_ERROR naming name for %j',
      async (body) => {
        const res = await create(body);
        const error = (await res.json()) as ErrorResponse;

        expect(res.status).toBe(400);
        expect(error.error.details?.map((detail) => detail.path)).toEqual(['name']);
      },
    );

    it('answers 400 for malformed JSON', async () => {
      const res = await create('{not json');
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(400);
      expect(body.error.details).toEqual([{ path: '', message: 'must be valid JSON' }]);
    });
  });

  describe('DELETE /api/brands/:name', () => {
    it('answers 204 with an empty body and removes an unused brand, spaces included', async () => {
      await create({ name: 'Acme Corp' });
      const res = await remove('Acme Corp');

      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect(await names()).toEqual(seededNames);
    });

    it('answers 404 NOT_FOUND to a second delete', async () => {
      await create({ name: 'Acme Corp' });
      await remove('Acme Corp');
      const res = await remove('Acme Corp');
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('answers 404 for an unknown name', async () => {
      expect((await remove('Ghost Brand')).status).toBe(404);
    });

    it('answers 409 CONFLICT naming brand while a product uses it, and changes nothing', async () => {
      const inUse = seed[0]!.brand;
      const res = await remove(inUse);
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(409);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.details?.map((detail) => detail.path)).toEqual(['brand']);
      expect(await names()).toEqual(seededNames);
      const products = (await (
        await app.request(`/api/products?brand=${encodeURIComponent(inUse)}&pageSize=100`)
      ).json()) as ListResponse<Product>;
      expect(products.meta.total).toBe(seed.filter((p) => p.brand === inUse).length);
    });

    it('succeeds once its last product is deleted', async () => {
      const inUse = seed[0]!.brand;
      for (const product of seed.filter((p) => p.brand === inUse)) {
        await app.request(`/api/products/${product.id}`, { method: 'DELETE' });
      }

      expect((await remove(inUse)).status).toBe(204);
      expect(await names()).not.toContain(inUse);
    });

    it('answers 400 VALIDATION_ERROR naming name for a name with an encoded slash', async () => {
      const res = await remove('AC/DC');
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(400);
      expect(body.error.details?.map((detail) => detail.path)).toEqual(['name']);
    });
  });

  describe('products and brands', () => {
    it('agrees with the products filter: every reported brand filters to its products', async () => {
      for (const name of seededNames) {
        const res = await app.request(`/api/products?brand=${encodeURIComponent(name)}&pageSize=100`);
        const body = (await res.json()) as ListResponse<Product>;
        expect(body.meta.total, name).toBe(seed.filter((p) => p.brand === name).length);
        expect(
          body.data.every((product) => product.brand === name),
          name,
        ).toBe(true);
      }
    });

    it('composes the brand filter with category and search', async () => {
      const target = seed.find((p) => p.brand === 'ACME')!;
      const url =
        `/api/products?brand=ACME&category=${target.category}` +
        `&q=${encodeURIComponent(target.title)}&pageSize=100`;
      const body = (await (await app.request(url)).json()) as ListResponse<Product>;

      expect(body.data.map((p) => p.id)).toContain(target.id);
      expect(body.data.every((p) => p.brand === 'ACME' && p.category === target.category)).toBe(
        true,
      );
    });

    it('creates a product for an existing brand and answers with the brand name', async () => {
      const res = await json('POST', '/api/products', newProduct({ brand: 'Globex' }));

      expect(res.status).toBe(201);
      expect(((await res.json()) as ItemResponse<Product>).data.brand).toBe('Globex');
    });

    it('rejects an unknown brand on create with 400 naming brand, and never creates one', async () => {
      const res = await json('POST', '/api/products', newProduct({ brand: 'Nobody Inc' }));
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.map((detail) => detail.path)).toEqual(['brand']);
      expect(await names()).toEqual(seededNames);
    });

    it('changes the brand on patch', async () => {
      const res = await json('PATCH', `/api/products/${seed[0]!.id}`, { brand: 'Vandelay' });

      expect(res.status).toBe(200);
      expect(((await res.json()) as ItemResponse<Product>).data.brand).toBe('Vandelay');
    });

    it('rejects an unknown brand on patch with 400 naming brand, and leaves the product alone', async () => {
      const id = seed[0]!.id;
      const res = await json('PATCH', `/api/products/${id}`, { brand: 'Nobody Inc' });
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(400);
      expect(body.error.details?.map((detail) => detail.path)).toEqual(['brand']);
      const after = (await (await app.request(`/api/products/${id}`)).json()) as ItemResponse<Product>;
      expect(after.data.brand).toBe(seed[0]!.brand);
      expect(await names()).toEqual(seededNames);
    });

    it('never exposes the surrogate brand id on a product', async () => {
      const body = (await (await app.request('/api/products?pageSize=1')).json()) as ListResponse<
        Record<string, unknown>
      >;

      expect(Object.keys(body.data[0]!)).not.toContain('brandId');
      expect(Object.keys(body.data[0]!)).toContain('brand');
    });
  });
});
