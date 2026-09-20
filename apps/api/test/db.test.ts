import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { categories, products } from '../src/db/schema.js';
import { createTestDb, type TestDb } from './helpers.js';

const NOW = '2026-09-19T10:00:00.000Z';

function productRow(categoryId: number, overrides: Partial<typeof products.$inferInsert> = {}) {
  return {
    title: 'Large Flux Capacitor',
    description: 'Provides the maximum motive force.',
    categoryId,
    price: 9.99,
    stock: 42,
    brand: 'ACME',
    sku: 'ACM-FC-001',
    weight: 4,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/**
 * Drizzle may wrap the driver error, so walk the `cause` chain looking for the
 * SQLite result code the service layer will later translate into a 409.
 */
function sqliteCode(error: unknown): string | undefined {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('SQLITE_')) return code;
  }
  return undefined;
}

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the action to throw');
}

describe('schema and migrations', () => {
  let testDb: TestDb;

  beforeAll(() => {
    testDb = createTestDb();
  });
  afterAll(() => testDb.cleanup());

  beforeEach(() => {
    testDb.db.delete(products).run();
    testDb.db.delete(categories).run();
  });

  const columns = (table: string) =>
    (testDb.db.$client.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (column) => column.name,
    );

  it('creates the categories and products tables', () => {
    expect(columns('categories')).toEqual(expect.arrayContaining(['id', 'slug']));
    expect(columns('products')).toEqual(
      expect.arrayContaining([
        'id',
        'title',
        'description',
        'category_id',
        'price',
        'stock',
        'brand',
        'sku',
        'weight',
        'created_at',
        'updated_at',
      ]),
    );
  });

  it('stores timestamps flat and the category as a foreign key, per the data model', () => {
    const names = columns('products');

    expect(names).not.toContain('meta');
    expect(names).not.toContain('category');
  });

  it('can be applied twice without error', () => {
    expect(() => runMigrations(testDb.db)).not.toThrow();
  });

  it('round-trips a product through the drizzle schema', () => {
    const category = testDb.db.insert(categories).values({ slug: 'automotive' }).returning().get();
    const product = testDb.db.insert(products).values(productRow(category.id)).returning().get();

    expect(product).toMatchObject({
      id: expect.any(Number),
      categoryId: category.id,
      price: 9.99,
      sku: 'ACM-FC-001',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('assigns increasing integer ids that are not reused after a delete', () => {
    const category = testDb.db.insert(categories).values({ slug: 'automotive' }).returning().get();
    const first = testDb.db.insert(products).values(productRow(category.id)).returning().get();
    testDb.db.delete(products).run();
    const second = testDb.db
      .insert(products)
      .values(productRow(category.id, { sku: 'ACM-FC-002' }))
      .returning()
      .get();

    expect(second.id).toBeGreaterThan(first.id);
  });

  it('rejects a second product with the same sku', () => {
    const category = testDb.db.insert(categories).values({ slug: 'automotive' }).returning().get();
    testDb.db.insert(products).values(productRow(category.id)).run();

    const error = captureError(() =>
      testDb.db.insert(products).values(productRow(category.id)).run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_UNIQUE');
  });

  it('rejects a duplicate category slug', () => {
    testDb.db.insert(categories).values({ slug: 'automotive' }).run();

    const error = captureError(() =>
      testDb.db.insert(categories).values({ slug: 'automotive' }).run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_UNIQUE');
  });

  it('rejects a product whose category does not exist', () => {
    const error = captureError(() => testDb.db.insert(products).values(productRow(999)).run());

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
  });

  it('refuses to delete a category that still has products', () => {
    const category = testDb.db.insert(categories).values({ slug: 'automotive' }).returning().get();
    testDb.db.insert(products).values(productRow(category.id)).run();

    const error = captureError(() => testDb.db.delete(categories).run());

    // SQLite reports an ON DELETE RESTRICT violation as a trigger-class constraint,
    // unlike an insert against a missing parent, which is SQLITE_CONSTRAINT_FOREIGNKEY.
    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_TRIGGER');
    expect(testDb.db.select().from(categories).all()).toHaveLength(1);
  });

  it('requires every product field', () => {
    const category = testDb.db.insert(categories).values({ slug: 'automotive' }).returning().get();
    const incomplete = { ...productRow(category.id), title: undefined } as unknown;

    const error = captureError(() =>
      testDb.db
        .insert(products)
        .values(incomplete as typeof products.$inferInsert)
        .run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_NOTNULL');
  });
});

describe('createDb', () => {
  it('creates missing parent directories so db:migrate works from a clean checkout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'catalog-test-'));
    const path = join(dir, 'data', 'nested', 'catalog.db');

    try {
      const db = createDb(path);
      runMigrations(db);
      expect(db.select().from(categories).all()).toEqual([]);
      db.$client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enforces foreign keys on every connection it opens', () => {
    const dir = mkdtempSync(join(tmpdir(), 'catalog-test-'));

    try {
      const db = createDb(join(dir, 'fk.db'));
      expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
      db.$client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
