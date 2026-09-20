import {
  LOW_STOCK_THRESHOLD,
  type ParsedSort,
  type ProductStats,
  type SortField,
  type StockStatus,
} from '@catalog/shared';
import { and, asc, count, desc, eq, ne, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
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

export interface NewProduct {
  title: string;
  description: string;
  categoryId: number;
  price: number;
  stock: number;
  brand: string;
  sku: string;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductChanges {
  title?: string | undefined;
  description?: string | undefined;
  categoryId?: number | undefined;
  price?: number | undefined;
  stock?: number | undefined;
  brand?: string | undefined;
  sku?: string | undefined;
  weight?: number | undefined;
  updatedAt: string;
}

export interface ListOptions {
  limit: number;
  offset: number;
  /** Case-insensitive substring matched against title and description. */
  q?: string | undefined;
  /** Category slug. */
  category?: string | undefined;
  /** Only products in this stock band, as `stockStatus()` defines it. */
  stockStatus?: StockStatus | undefined;
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

/**
 * The stock column tested against the shared threshold, so the SQL and `stockStatus()` cannot
 * drift apart: out is at 0, low is 1 up to the threshold, in is above it.
 */
function stockCondition(status: StockStatus): SQL {
  switch (status) {
    case 'out':
      return sql`${products.stock} <= 0`;
    case 'low':
      return sql`${products.stock} > 0 AND ${products.stock} <= ${LOW_STOCK_THRESHOLD}`;
    case 'in':
      return sql`${products.stock} > ${LOW_STOCK_THRESHOLD}`;
  }
}

function whereClause({
  q,
  category,
  stockStatus,
}: Pick<ListOptions, 'q' | 'category' | 'stockStatus'>): SQL | undefined {
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
  if (stockStatus) conditions.push(stockCondition(stockStatus));

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

    /** The id of the category with this slug, or `undefined` when there is none. */
    findCategoryId(slug: string): number | undefined {
      return db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, slug))
        .get()?.id;
    },

    /** True when a product other than `exceptId` (when given) already uses this sku. */
    skuExists(sku: string, exceptId?: number): boolean {
      return (
        db
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.sku, sku),
              exceptId === undefined ? undefined : ne(products.id, exceptId),
            ),
          )
          .get() !== undefined
      );
    },

    /** Writes the given columns (undefined ones are skipped). Returns whether a row matched. */
    update(id: number, changes: ProductChanges): boolean {
      return db.update(products).set(changes).where(eq(products.id, id)).run().changes > 0;
    },

    /** Removes the product. Returns whether a row was removed. */
    delete(id: number): boolean {
      return db.delete(products).where(eq(products.id, id)).run().changes > 0;
    },

    /** Inserts the row and returns its new id. */
    insert(values: NewProduct): number {
      return db.insert(products).values(values).returning({ id: products.id }).get().id;
    },

    /** One page of the products matching the filters, plus the total number of matches. */
    /** Catalog-wide counts by stock status and the value of the stock on hand (`price * stock`). */
    stats(): ProductStats {
      const countWhere = (status: StockStatus) =>
        sql<number>`COALESCE(SUM(${stockCondition(status)}), 0)`;

      const row = db
        .select({
          total: count(),
          inStock: countWhere('in'),
          lowStock: countWhere('low'),
          outOfStock: countWhere('out'),
          inventoryValue: sql<number>`COALESCE(ROUND(SUM(${products.price} * ${products.stock}), 2), 0)`,
        })
        .from(products)
        .get();

      return row ?? { total: 0, inStock: 0, lowStock: 0, outOfStock: 0, inventoryValue: 0 };
    },

    /** One page of the products matching the filters, plus the total number of matches. */
    list({ limit, offset, q, category, stockStatus, sort }: ListOptions): ProductPage {
      const where = whereClause({ q, category, stockStatus });
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
