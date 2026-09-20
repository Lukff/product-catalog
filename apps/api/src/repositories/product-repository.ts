import { asc, count, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { categories, products } from '../db/schema.js';

/** A stored product with its category resolved to the slug. Timestamps are still flat columns. */
export interface ProductRecord {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  brand: string;
  sku: string;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPage {
  rows: ProductRecord[];
  total: number;
}

export function createProductRepository(db: Db) {
  return {
    /** One page of products in a stable order (by id), plus the total row count. */
    list({ limit, offset }: { limit: number; offset: number }): ProductPage {
      const rows = db
        .select({
          id: products.id,
          title: products.title,
          description: products.description,
          category: categories.slug,
          price: products.price,
          stock: products.stock,
          brand: products.brand,
          sku: products.sku,
          weight: products.weight,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .orderBy(asc(products.id))
        .limit(limit)
        .offset(offset)
        .all();

      const total = db.select({ total: count() }).from(products).get()?.total ?? 0;

      return { rows, total };
    },
  };
}

export type ProductRepository = ReturnType<typeof createProductRepository>;
