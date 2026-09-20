import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { brands, categories, products } from '../src/db/schema.js';
import { createTestDb, type TestDb } from './helpers.js';

const NOW = '2026-09-19T10:00:00.000Z';

function productRow(
  categoryId: number,
  brandId: number,
  overrides: Partial<typeof products.$inferInsert> = {},
) {
  return {
    title: 'Large Flux Capacitor',
    description: 'Provides the maximum motive force.',
    categoryId,
    priceCents: 999,
    stock: 42,
    brandId,
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
    testDb.db.delete(brands).run();
  });

  const insertParents = () => ({
    category: testDb.db.insert(categories).values({ slug: 'automotive' }).returning().get(),
    brand: testDb.db.insert(brands).values({ name: 'ACME' }).returning().get(),
  });

  const columns = (table: string) =>
    (testDb.db.$client.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (column) => column.name,
    );

  it('creates the categories, brands and products tables', () => {
    expect(columns('categories')).toEqual(expect.arrayContaining(['id', 'slug']));
    expect(columns('brands')).toEqual(expect.arrayContaining(['id', 'name']));
    expect(columns('products')).toEqual(
      expect.arrayContaining([
        'id',
        'title',
        'description',
        'category_id',
        'price_cents',
        'stock',
        'brand_id',
        'sku',
        'weight',
        'created_at',
        'updated_at',
      ]),
    );
  });

  it('stores timestamps flat and the category and brand as foreign keys, per the data model', () => {
    const names = columns('products');

    expect(names).not.toContain('meta');
    expect(names).not.toContain('category');
    expect(names).not.toContain('brand');
  });

  it('can be applied twice without error', () => {
    expect(() => runMigrations(testDb.db)).not.toThrow();
  });

  it('round-trips a product through the drizzle schema', () => {
    const { category, brand } = insertParents();
    const product = testDb.db
      .insert(products)
      .values(productRow(category.id, brand.id))
      .returning()
      .get();

    expect(product).toMatchObject({
      id: expect.any(Number),
      categoryId: category.id,
      brandId: brand.id,
      priceCents: 999,
      sku: 'ACM-FC-001',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('assigns increasing integer ids that are not reused after a delete', () => {
    const { category, brand } = insertParents();
    const first = testDb.db
      .insert(products)
      .values(productRow(category.id, brand.id))
      .returning()
      .get();
    testDb.db.delete(products).run();
    const second = testDb.db
      .insert(products)
      .values(productRow(category.id, brand.id, { sku: 'ACM-FC-002' }))
      .returning()
      .get();

    expect(second.id).toBeGreaterThan(first.id);
  });

  it('rejects a second product with the same sku', () => {
    const { category, brand } = insertParents();
    testDb.db.insert(products).values(productRow(category.id, brand.id)).run();

    const error = captureError(() =>
      testDb.db.insert(products).values(productRow(category.id, brand.id)).run(),
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

  it('rejects a duplicate brand name', () => {
    testDb.db.insert(brands).values({ name: 'ACME' }).run();

    const error = captureError(() => testDb.db.insert(brands).values({ name: 'ACME' }).run());

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_UNIQUE');
  });

  it('rejects a product whose category does not exist', () => {
    const { brand } = insertParents();
    const error = captureError(() =>
      testDb.db.insert(products).values(productRow(999, brand.id)).run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
  });

  it('rejects a product whose brand does not exist', () => {
    const { category } = insertParents();
    const error = captureError(() =>
      testDb.db.insert(products).values(productRow(category.id, 999)).run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
  });

  it('refuses to delete a brand that still has products', () => {
    const { category, brand } = insertParents();
    testDb.db.insert(products).values(productRow(category.id, brand.id)).run();

    const error = captureError(() => testDb.db.delete(brands).run());

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_TRIGGER');
    expect(testDb.db.select().from(brands).all()).toHaveLength(1);
  });

  it('refuses to delete a category that still has products', () => {
    const { category, brand } = insertParents();
    testDb.db.insert(products).values(productRow(category.id, brand.id)).run();

    const error = captureError(() => testDb.db.delete(categories).run());

    // SQLite reports an ON DELETE RESTRICT violation as a trigger-class constraint,
    // unlike an insert against a missing parent, which is SQLITE_CONSTRAINT_FOREIGNKEY.
    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_TRIGGER');
    expect(testDb.db.select().from(categories).all()).toHaveLength(1);
  });

  it('requires every product field', () => {
    const { category, brand } = insertParents();
    const incomplete = { ...productRow(category.id, brand.id), title: undefined } as unknown;

    const error = captureError(() =>
      testDb.db
        .insert(products)
        .values(incomplete as typeof products.$inferInsert)
        .run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_NOTNULL');
  });
});

describe('brands migration', () => {
  const migrationSql = (file: string) =>
    readFileSync(fileURLToPath(new URL(`../src/db/migrations/${file}`, import.meta.url)), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);

  it('moves each distinct brand text into brands and re-points existing products at it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'catalog-test-'));

    try {
      const db = createDb(join(dir, 'legacy.db'));
      const run = (sql: string) => db.$client.exec(sql);
      migrationSql('0000_melted_sir_ram.sql').forEach(run);
      run("INSERT INTO categories (slug) VALUES ('automotive')");
      const legacyProduct = (id: number, sku: string, brand: string) =>
        run(
          `INSERT INTO products (id, title, description, category_id, price, stock, brand, sku, weight, created_at, updated_at)
           VALUES (${id}, 'Item ${id}', 'Old row.', 1, 2.5, 7, '${brand}', '${sku}', 1, '${NOW}', '${NOW}')`,
        );
      legacyProduct(1, 'A-1', 'ACME');
      legacyProduct(2, 'G-1', 'Globex');
      legacyProduct(3, 'A-2', 'ACME');

      migrationSql('0001_brands.sql').forEach(run);

      const stored = db.$client
        .prepare(
          'SELECT p.id, p.sku, p.stock, b.name FROM products p JOIN brands b ON b.id = p.brand_id ORDER BY p.id',
        )
        .all();
      expect(stored).toEqual([
        { id: 1, sku: 'A-1', stock: 7, name: 'ACME' },
        { id: 2, sku: 'G-1', stock: 7, name: 'Globex' },
        { id: 3, sku: 'A-2', stock: 7, name: 'ACME' },
      ]);
      expect(
        db
          .select()
          .from(brands)
          .all()
          .map((brand) => brand.name),
      ).toEqual(['ACME', 'Globex']);
      expect(db.$client.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      db.$client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('price_cents migration', () => {
  const migrationSql = (file: string) =>
    readFileSync(fileURLToPath(new URL(`../src/db/migrations/${file}`, import.meta.url)), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);

  it('converts each stored decimal price to exact integer cents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'catalog-test-'));

    try {
      const db = createDb(join(dir, 'legacy.db'));
      const run = (sql: string) => db.$client.exec(sql);
      migrationSql('0000_melted_sir_ram.sql').forEach(run);
      run("INSERT INTO categories (slug) VALUES ('automotive')");
      migrationSql('0001_brands.sql').forEach(run);
      run("INSERT INTO brands (name) VALUES ('ACME')");
      // 0.29 and 1.15 are the classic values where price * 100 is not an integer in floating point.
      [0, 0.29, 1.15, 19.99, 1234.5].forEach((price, index) =>
        run(
          `INSERT INTO products (id, title, description, category_id, price, stock, brand_id, sku, weight, created_at, updated_at)
           VALUES (${index + 1}, 'Item', 'Old row.', 1, ${price}, 7, 1, 'SKU-${index}', 1, '${NOW}', '${NOW}')`,
        ),
      );

      migrationSql('0002_price_cents.sql').forEach(run);

      const stored = db.$client
        .prepare('SELECT price_cents, typeof(price_cents) AS type FROM products ORDER BY id')
        .all();
      expect(stored).toEqual([
        { price_cents: 0, type: 'integer' },
        { price_cents: 29, type: 'integer' },
        { price_cents: 115, type: 'integer' },
        { price_cents: 1999, type: 'integer' },
        { price_cents: 123450, type: 'integer' },
      ]);
      expect(db.$client.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      db.$client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
