import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { brands, categories, products } from '../src/db/schema.js';
import { loadSeedData, parseSeedData, seedDatabase } from '../src/db/seed.js';
import { createTestDb, type TestDb } from './helpers.js';

const LOW_STOCK_MAX = 5;

describe('seed data', () => {
  const data = loadSeedData();

  it('holds between 30 and 40 products', () => {
    expect(data.length).toBeGreaterThanOrEqual(30);
    expect(data.length).toBeLessThanOrEqual(40);
  });

  it('numbers the products 1..N in order, so seeded ids are predictable', () => {
    expect(data.map((product) => product.id)).toEqual(data.map((_, index) => index + 1));
  });

  it('uses each sku once', () => {
    const skus = data.map((product) => product.sku);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('never has a product updated before it was created', () => {
    for (const product of data) {
      expect(Date.parse(product.meta.updatedAt), product.sku).toBeGreaterThanOrEqual(
        Date.parse(product.meta.createdAt),
      );
    }
  });

  it('spans several categories and brands', () => {
    expect(new Set(data.map((product) => product.category)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(data.map((product) => product.brand)).size).toBeGreaterThanOrEqual(4);
  });

  it('includes out-of-stock and low-stock products for filters and metrics to show', () => {
    const outOfStock = data.filter((product) => product.stock === 0);
    const lowStock = data.filter((product) => product.stock >= 1 && product.stock <= LOW_STOCK_MAX);

    expect(outOfStock.length).toBeGreaterThanOrEqual(3);
    expect(lowStock.length).toBeGreaterThanOrEqual(4);
  });

  it("starts with the brief's two sample products, unchanged", () => {
    expect(data[0]).toEqual({
      id: 1,
      title: 'Large Flux Capacitor',
      description:
        'The Large Flux Capacitor provides the maximum motive force for your inter-dimensional aluminum automobile.',
      category: 'automotive',
      price: 9.99,
      stock: 42,
      brand: 'ACME',
      sku: 'ACM-FC-001',
      weight: 4,
      meta: { createdAt: '2025-04-30T09:41:02.053Z', updatedAt: '2025-04-30T09:41:02.053Z' },
    });
    expect(data[1]).toEqual({
      id: 2,
      title: 'Medium Flux Capacitor',
      description:
        "The Medium Flux Capacitor is a great budget option if you don't need to travel far in your inter-dimensional aluminum automobile.",
      category: 'automotive',
      price: 5.99,
      stock: 42,
      brand: 'ACME',
      sku: 'ACM-FC-002',
      weight: 3.25,
      meta: { createdAt: '2025-04-29T19:36:02.053Z', updatedAt: '2025-04-30T09:41:02.053Z' },
    });
  });
});

describe('parseSeedData', () => {
  const valid = {
    id: 1,
    title: 'Thing',
    description: 'A thing.',
    category: 'tools',
    price: 1,
    stock: 1,
    brand: 'ACME',
    sku: 'T-1',
    weight: 1,
    meta: { createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
  };

  it('accepts valid rows', () => {
    expect(parseSeedData([valid])).toEqual([valid]);
  });

  it('names the row and field of an invalid product', () => {
    expect(() => parseSeedData([valid, { ...valid, id: 2, price: -1 }])).toThrow(
      /row 1.*price.*must be >= 0/,
    );
  });

  it('rejects something that is not an array', () => {
    expect(() => parseSeedData({ products: [] })).toThrow(/array/);
  });
});

describe('seedDatabase', () => {
  const data = loadSeedData();
  const distinctSlugs = new Set(data.map((product) => product.category));
  const distinctBrands = new Set(data.map((product) => product.brand));
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });
  afterEach(() => testDb.cleanup());

  const countRows = (table: typeof products | typeof categories | typeof brands) =>
    testDb.db.select().from(table).all().length;

  it('inserts every category and product and reports what it added', () => {
    const result = seedDatabase(testDb.db, data);

    expect(result).toEqual({
      categories: distinctSlugs.size,
      brands: distinctBrands.size,
      products: data.length,
    });
    expect(countRows(categories)).toBe(distinctSlugs.size);
    expect(countRows(brands)).toBe(distinctBrands.size);
    expect(countRows(products)).toBe(data.length);
  });

  it('keeps the seed ids and timestamps', () => {
    seedDatabase(testDb.db, data);

    const first = testDb.db.select().from(products).where(eq(products.id, 1)).get();
    const second = testDb.db.select().from(products).where(eq(products.id, 2)).get();

    expect(first).toMatchObject({
      title: 'Large Flux Capacitor',
      createdAt: '2025-04-30T09:41:02.053Z',
      updatedAt: '2025-04-30T09:41:02.053Z',
    });
    expect(second).toMatchObject({
      title: 'Medium Flux Capacitor',
      createdAt: '2025-04-29T19:36:02.053Z',
      updatedAt: '2025-04-30T09:41:02.053Z',
    });
  });

  it('links every product to the category carrying its slug', () => {
    seedDatabase(testDb.db, data);

    const stored = testDb.db
      .select({ id: products.id, slug: categories.slug })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .all();

    expect(stored).toHaveLength(data.length);
    for (const row of stored) {
      expect(row.slug, `product ${row.id}`).toBe(data[row.id - 1]?.category);
    }
  });

  it('is idempotent: a second run adds nothing and leaves the same row counts', () => {
    seedDatabase(testDb.db, data);
    const second = seedDatabase(testDb.db, data);

    expect(second).toEqual({ categories: 0, brands: 0, products: 0 });
    expect(countRows(categories)).toBe(distinctSlugs.size);
    expect(countRows(brands)).toBe(distinctBrands.size);
    expect(countRows(products)).toBe(data.length);
  });

  it('never overwrites an edit made to a seeded product', () => {
    seedDatabase(testDb.db, data);
    testDb.db.update(products).set({ price: 1.11, stock: 7 }).where(eq(products.id, 1)).run();

    seedDatabase(testDb.db, data);

    const row = testDb.db.select().from(products).where(eq(products.id, 1)).get();
    expect(row).toMatchObject({ price: 1.11, stock: 7 });
  });

  it('restores a seeded product that was deleted', () => {
    seedDatabase(testDb.db, data);
    testDb.db.delete(products).where(eq(products.id, 3)).run();

    const result = seedDatabase(testDb.db, data);

    expect(result).toEqual({ categories: 0, brands: 0, products: 1 });
    expect(testDb.db.select().from(products).where(eq(products.id, 3)).get()).toBeDefined();
  });

  it('leaves products and categories created outside the seed alone', () => {
    seedDatabase(testDb.db, data);
    const misc = testDb.db.insert(categories).values({ slug: 'misc' }).returning().get();
    const me = testDb.db.insert(brands).values({ name: 'Me' }).returning().get();
    testDb.db
      .insert(products)
      .values({
        title: 'Mine',
        description: 'Added by hand.',
        categoryId: misc.id,
        price: 1,
        stock: 1,
        brandId: me.id,
        sku: 'MINE-1',
        weight: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      .run();

    seedDatabase(testDb.db, data);

    expect(countRows(products)).toBe(data.length + 1);
    expect(countRows(categories)).toBe(distinctSlugs.size + 1);
    expect(countRows(brands)).toBe(distinctBrands.size + 1);
  });
});
