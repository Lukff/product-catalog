import { type ErrorResponse, type ListResponse, type Product } from '@catalog/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadSeedData, seedDatabase } from '../src/db/seed.js';
import { createTestDb, type TestDb } from './helpers.js';

const seed = loadSeedData();

type SortKey = 'title' | 'price' | 'stock' | 'weight' | 'createdAt' | 'updatedAt';

function sortValue(product: Product, key: SortKey): string | number {
  switch (key) {
    case 'title':
      return product.title.toLowerCase();
    case 'createdAt':
      return product.meta.createdAt;
    case 'updatedAt':
      return product.meta.updatedAt;
    default:
      return product[key];
  }
}

/** What the API should return for these params, computed independently from the seed rows. */
function expectedIds(options: { q?: string; category?: string; sort?: string }): number[] {
  const needle = options.q?.toLowerCase();
  const rows = seed.filter(
    (product) =>
      (!options.category || product.category === options.category) &&
      (!needle ||
        product.title.toLowerCase().includes(needle) ||
        product.description.toLowerCase().includes(needle)),
  );

  const descending = options.sort?.startsWith('-') ?? false;
  const key = (descending ? options.sort?.slice(1) : options.sort) as SortKey | undefined;

  return [...rows]
    .sort((a, b) => {
      if (key) {
        const left = sortValue(a, key);
        const right = sortValue(b, key);
        if (left !== right) return (left < right ? -1 : 1) * (descending ? -1 : 1);
      }
      return a.id - b.id;
    })
    .map((product) => product.id);
}

describe('GET /api/products search, filter and sort', () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    testDb = createTestDb();
    seedDatabase(testDb.db, seed);
    app = createApp({ db: testDb.db });
  });
  afterAll(() => testDb.cleanup());

  async function ids(query: string) {
    const res = await app.request(`/api/products?${query}`);
    const body = (await res.json()) as ListResponse<Product>;
    return { res, body, ids: body.data.map((product) => product.id) };
  }

  describe('?q=', () => {
    it('matches the description, case-insensitively, not only the title', async () => {
      const expected = expectedIds({ q: 'battery' });
      // Guard: the term must really be description-only for at least one product.
      expect(
        seed.some(
          (product) =>
            product.description.toLowerCase().includes('battery') &&
            !product.title.toLowerCase().includes('battery'),
        ),
      ).toBe(true);

      const { ids: found, body } = await ids('q=BATTERY');

      expect(found).toEqual(expected);
      expect(body.meta.total).toBe(expected.length);
    });

    it('matches the title', async () => {
      const expected = expectedIds({ q: 'flux capacitor' });
      expect(expected.length).toBeGreaterThan(0);

      const { ids: found } = await ids('q=flux%20capacitor');

      expect(found).toEqual(expected);
    });

    it('returns an empty page when nothing matches', async () => {
      const { res, body } = await ids('q=zzzz-no-such-product');

      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it('treats % and _ literally instead of as LIKE wildcards', async () => {
      const percent = await ids('q=%25');
      const underscore = await ids('q=_');
      const backslash = await ids('q=%5C');

      expect(percent.ids).toEqual(expectedIds({ q: '%' }));
      expect(underscore.ids).toEqual(expectedIds({ q: '_' }));
      expect(backslash.ids).toEqual(expectedIds({ q: '\\' }));
    });

    it('ignores a blank q', async () => {
      const { body } = await ids('q=%20%20');

      expect(body.meta.total).toBe(seed.length);
    });
  });

  describe('?category=', () => {
    it('filters by category and counts only the matching rows', async () => {
      const expected = expectedIds({ category: 'kitchen' });
      expect(expected.length).toBeGreaterThan(0);

      const { body, ids: found } = await ids('category=kitchen');

      expect(found).toEqual(expected);
      expect(body.meta.total).toBe(expected.length);
      expect(body.data.every((product) => product.category === 'kitchen')).toBe(true);
    });

    it('returns an empty page for a category with no products', async () => {
      const { res, body } = await ids('category=no-such-category');

      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });
  });

  describe('?sort=', () => {
    it.each(['price', '-price', 'stock', '-stock', 'title', '-title', 'weight', '-createdAt'])(
      'orders by %s, breaking ties by id',
      async (sort) => {
        const { ids: found } = await ids(`sort=${sort}&pageSize=100`);

        expect(found).toEqual(expectedIds({ sort }));
      },
    );

    it('puts the most expensive product first for -price', async () => {
      const { body } = await ids('sort=-price');
      const prices = body.data.map((product) => product.price);

      expect(prices).toEqual([...prices].sort((a, b) => b - a));
    });

    it('rejects a field outside the whitelist', async () => {
      const res = await app.request('/api/products?sort=bogus');
      const body = (await res.json()) as ErrorResponse;

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.map((detail) => detail.path)).toContain('sort');
    });
  });

  describe('combined params', () => {
    it('applies q, category, sort and page together with a consistent meta.total', async () => {
      const options = { q: 'a', category: 'automotive', sort: '-price' };
      const expected = expectedIds(options);
      expect(expected.length).toBeGreaterThan(2);

      const first = await ids('q=a&category=automotive&sort=-price&pageSize=2&page=1');
      const second = await ids('q=a&category=automotive&sort=-price&pageSize=2&page=2');

      expect(first.ids).toEqual(expected.slice(0, 2));
      expect(second.ids).toEqual(expected.slice(2, 4));
      expect(first.body.meta).toEqual({
        page: 1,
        pageSize: 2,
        total: expected.length,
        totalPages: Math.ceil(expected.length / 2),
      });
    });
  });
});
