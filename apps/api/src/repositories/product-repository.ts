import type { ParsedSort, SortField } from '@catalog/shared';
import { and, asc, count, desc, eq, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
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

export interface ListOptions {
  limit: number;
  offset: number;
  /** Case-insensitive substring matched against title and description. */
  q?: string | undefined;
  /** Category slug. */
  category?: string | undefined;
  /** Defaults to id ascending. Ties always fall back to id, so paging is stable. */
  sort?: ParsedSort | undefined;
}

export interface ProductPage {
  rows: ProductRecord[];
  total: number;
}

const sortColumns: Record<SortField, AnyColumn | SQL> = {
  // Alphabetical order should not depend on letter case.
  title: sql`${products.title} COLLATE NOCASE`,
  price: products.price,
  stock: products.stock,
  weight: products.weight,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};

/** LIKE escape character. `%` and `_` are wildcards; escaping them makes a search for "50%" match the text "50%". */
const LIKE_ESCAPE = '\\';

function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => LIKE_ESCAPE + char)}%`;
}

function whereClause({ q, category }: Pick<ListOptions, 'q' | 'category'>): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];

  if (q) {
    const pattern = containsPattern(q);
    conditions.push(
      or(
        sql`${products.title} LIKE ${pattern} ESCAPE ${LIKE_ESCAPE}`,
        sql`${products.description} LIKE ${pattern} ESCAPE ${LIKE_ESCAPE}`,
      ),
    );
  }
  if (category) conditions.push(eq(categories.slug, category));

  return and(...conditions);
}

const productColumns = {
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
};

export function createProductRepository(db: Db) {
  return {
    /** One product with its category slug resolved, or `undefined` when the id does not exist. */
    findById(id: number): ProductRecord | undefined {
      return db
        .select(productColumns)
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(eq(products.id, id))
        .get();
    },

    /** One page of the products matching the filters, plus the total number of matches. */
    list({ limit, offset, q, category, sort }: ListOptions): ProductPage {
      const where = whereClause({ q, category });
      const orderBy = sort
        ? [(sort.direction === 'desc' ? desc : asc)(sortColumns[sort.field]), asc(products.id)]
        : [asc(products.id)];

      const rows = db
        .select(productColumns)
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset)
        .all();

      const total =
        db
          .select({ total: count() })
          .from(products)
          .innerJoin(categories, eq(products.categoryId, categories.id))
          .where(where)
          .get()?.total ?? 0;

      return { rows, total };
    },
  };
}

export type ProductRepository = ReturnType<typeof createProductRepository>;
