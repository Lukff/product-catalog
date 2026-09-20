import type { Category, ErrorResponse, ItemResponse, ListResponse, Product } from '@catalog/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadSeedData, seedDatabase } from '../src/db/seed.js';
import { createTestDb, type TestDb } from './helpers.js';

const seed = loadSeedData();
const seededSlugs = [...new Set(seed.map((product) => product.category))].sort();

describe('categories API', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  const list = (query = '') => app.request(`/api/categories${query}`);
  const create = (body: unknown) =>
    app.request('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const remove = (slug: string) => app.request(`/api/categories/${slug}`, { method: 'DELETE' });
  const slugs = async () =>
    ((await (await list('?pageSize=100')).json()) as ListResponse<Category>).data.map(
      (category) => category.slug,
    );

  beforeEach(() => {
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
    app = createApp({ db: testDb.db });
  });
  afterEach(() => testDb.cleanup());

  describe('GET /api/categories', () => {
    it('returns the paginated envelope, ordered by slug, with only the slug on the wire', async () => {
      const res = await list('?pageSize=100');
      const body = (await res.json()) as ListResponse<Category>;

      expect(res.status).toBe(200);
      expect(body.data).toEqual(seededSlugs.map((slug) => ({ slug })));
      expect(body.meta).toEqual({
        page: 1,
        pageSize: 100,
        total: seededSlugs.length,
        totalPages: 1,
      });
    });

    it('pages through the categories without overlap', async () => {
      const first = (await (await list('?page=1&pageSize=2')).json()) as ListResponse<Category>;
      const second = (await (await list('?page=2&pageSize=2')).json()) as ListResponse<Category>;

      expect(first.data.map((c) => c.slug)).toEqual(seededSlugs.slice(0, 2));
      expect(second.data.map((c) => c.slug)).toEqual(seededSlugs.slice(2, 4));
      expect(first.meta.totalPages).toBe(Math.ceil(seededSlugs.length / 2));
    });

    it('answers 400 VALIDATION_ERROR for a bad page', async () => {
      const res = await list('?page=0');
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(400);
      expect(body.error.details?.map((detail) => detail.path)).toEqual(['page']);
    });

    it('agrees with the products filter: every reported category filters to at least one product', async () => {
      for (const slug of seededSlugs) {
        const res = await app.request(`/api/products?category=${slug}`);
        const body = (await res.json()) as ListResponse<Product>;
        expect(body.meta.total, slug).toBeGreaterThan(0);
      }
    });
  });

  describe('POST /api/categories', () => {
    it('answers 201 with the new category and lists it', async () => {
      const res = await create({ slug: 'garden-tools' });

      expect(res.status).toBe(201);
      expect(((await res.json()) as ItemResponse<Category>).data).toEqual({ slug: 'garden-tools' });
      expect(await slugs()).toContain('garden-tools');
    });

    it('strips a client-sent id', async () => {
      const res = await create({ slug: 'garden-tools', id: 999 });

      expect(res.status).toBe(201);
      expect(((await res.json()) as ItemResponse<Category>).data).toEqual({ slug: 'garden-tools' });
    });

    it('makes the category usable as an empty filter', async () => {
      await create({ slug: 'garden-tools' });
      const res = await app.request('/api/products?category=garden-tools');

      expect(res.status).toBe(200);
      expect(((await res.json()) as ListResponse<Product>).meta.total).toBe(0);
    });

    it('answers 409 CONFLICT naming slug for a duplicate, and adds nothing', async () => {
      const existing = seededSlugs[0]!;
      const res = await create({ slug: existing });
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(409);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.details?.map((detail) => detail.path)).toEqual(['slug']);
      expect(await slugs()).toEqual(seededSlugs);
    });

    it.each(['Home Decor', 'home_decor', '', '-x'])(
      'answers 400 VALIDATION_ERROR naming slug for "%s"',
      async (slug) => {
        const res = await create({ slug });
        const body = (await res.json()) as ErrorResponse;

        expect(res.status).toBe(400);
        expect(body.error.details?.map((detail) => detail.path)).toEqual(['slug']);
      },
    );

    it('answers 400 for malformed JSON', async () => {
      const res = await create('{not json');
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(400);
      expect(body.error.details).toEqual([{ path: '', message: 'must be valid JSON' }]);
    });
  });

  describe('DELETE /api/categories/:slug', () => {
    it('answers 204 with an empty body and removes an unused category', async () => {
      await create({ slug: 'garden-tools' });
      const res = await remove('garden-tools');

      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect(await slugs()).toEqual(seededSlugs);
    });

    it('answers 404 NOT_FOUND to a second delete', async () => {
      await create({ slug: 'garden-tools' });
      await remove('garden-tools');
      const res = await remove('garden-tools');
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('answers 404 for an unknown slug', async () => {
      expect((await remove('ghost-town')).status).toBe(404);
    });

    it('answers 409 CONFLICT naming category while a product uses it, and changes nothing', async () => {
      const inUse = seed[0]!.category;
      const res = await remove(inUse);
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(409);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.details?.map((detail) => detail.path)).toEqual(['category']);
      expect(await slugs()).toEqual(seededSlugs);
      const products = (await (
        await app.request(`/api/products?category=${inUse}&pageSize=100`)
      ).json()) as ListResponse<Product>;
      expect(products.meta.total).toBe(seed.filter((p) => p.category === inUse).length);
    });

    it('succeeds once its last product is moved or deleted', async () => {
      const inUse = seed[0]!.category;
      for (const product of seed.filter((p) => p.category === inUse)) {
        await app.request(`/api/products/${product.id}`, { method: 'DELETE' });
      }

      expect((await remove(inUse)).status).toBe(204);
      expect(await slugs()).not.toContain(inUse);
    });

    it('answers 400 VALIDATION_ERROR naming slug for a malformed slug', async () => {
      const res = await remove('Bad_Slug');
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(400);
      expect(body.error.details?.map((detail) => detail.path)).toEqual(['slug']);
    });
  });
});
