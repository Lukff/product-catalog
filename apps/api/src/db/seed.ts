import { productSchema, toCents, zodIssuesToDetails, type Product } from '@catalog/shared';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.js';
import { brands, categories, products } from './schema.js';

const seedFile = fileURLToPath(new URL('./seed.json', import.meta.url));

export interface SeedResult {
  /** Rows actually inserted; anything already present is not counted. */
  categories: number;
  brands: number;
  products: number;
}

/** Validates raw seed rows against the shared product schema, naming the row that fails. */
export function parseSeedData(raw: unknown): Product[] {
  if (!Array.isArray(raw)) throw new Error('seed.json must contain an array of products');

  return raw.map((row, index) => {
    const result = productSchema.safeParse(row);
    if (!result.success) {
      const problems = zodIssuesToDetails(result.error)
        .map((detail) => `${detail.path} ${detail.message}`)
        .join('; ');
      throw new Error(`seed.json row ${index}: ${problems}`);
    }
    return result.data;
  });
}

export function loadSeedData(): Product[] {
  return parseSeedData(JSON.parse(readFileSync(seedFile, 'utf8')));
}

/**
 * Inserts the categories and brands the products use, then the products with their seed ids
 * and timestamps. Rows that already exist (by id, sku or slug) are left untouched,
 * so it is safe to run repeatedly: it never overwrites an edit, and it restores a
 * seed row that was deleted.
 */
export function seedDatabase(db: Db, data: Product[]): SeedResult {
  return db.transaction((tx) => {
    const slugs = [...new Set(data.map((product) => product.category))];
    const insertedCategories = slugs.length
      ? tx
          .insert(categories)
          .values(slugs.map((slug) => ({ slug })))
          .onConflictDoNothing()
          .returning()
          .all().length
      : 0;

    const idBySlug = new Map(
      tx
        .select()
        .from(categories)
        .all()
        .map((row) => [row.slug, row.id]),
    );

    const names = [...new Set(data.map((product) => product.brand))];
    const insertedBrands = names.length
      ? tx
          .insert(brands)
          .values(names.map((name) => ({ name })))
          .onConflictDoNothing()
          .returning()
          .all().length
      : 0;

    const idByName = new Map(
      tx
        .select()
        .from(brands)
        .all()
        .map((row) => [row.name, row.id]),
    );

    const rows = data.map((product) => {
      const categoryId = idBySlug.get(product.category);
      if (categoryId === undefined) throw new Error(`No category for slug "${product.category}"`);
      const brandId = idByName.get(product.brand);
      if (brandId === undefined) throw new Error(`No brand named "${product.brand}"`);

      return {
        id: product.id,
        title: product.title,
        description: product.description,
        categoryId,
        priceCents: toCents(product.price),
        stock: product.stock,
        brandId,
        sku: product.sku,
        weight: product.weight,
        createdAt: product.meta.createdAt,
        updatedAt: product.meta.updatedAt,
      };
    });
    const insertedProducts = rows.length
      ? tx.insert(products).values(rows).onConflictDoNothing().returning().all().length
      : 0;

    return { categories: insertedCategories, brands: insertedBrands, products: insertedProducts };
  });
}
