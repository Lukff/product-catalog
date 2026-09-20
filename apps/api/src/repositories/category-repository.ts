import { asc, count, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { categories, products } from '../db/schema.js';

export interface CategoryPage {
  slugs: string[];
  total: number;
}

export function createCategoryRepository(db: Db) {
  return {
    /** One page of category slugs in alphabetical order, plus the total number of categories. */
    list({ limit, offset }: { limit: number; offset: number }): CategoryPage {
      const slugs = db
        .select({ slug: categories.slug })
        .from(categories)
        .orderBy(asc(categories.slug))
        .limit(limit)
        .offset(offset)
        .all()
        .map((row) => row.slug);
      const total = db.select({ total: count() }).from(categories).get()?.total ?? 0;

      return { slugs, total };
    },

    /** True when a category with this slug exists. */
    exists(slug: string): boolean {
      return (
        db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).get() !==
        undefined
      );
    },

    /** Inserts the category. Callers check `exists` first; a duplicate slug violates the unique index. */
    insert(slug: string): void {
      db.insert(categories).values({ slug }).run();
    },

    /** How many products belong to the category with this slug. */
    productCount(slug: string): number {
      return (
        db
          .select({ total: count() })
          .from(products)
          .innerJoin(categories, eq(products.categoryId, categories.id))
          .where(eq(categories.slug, slug))
          .get()?.total ?? 0
      );
    },

    /** Removes the category. Returns whether a row was removed. */
    delete(slug: string): boolean {
      return db.delete(categories).where(eq(categories.slug, slug)).run().changes > 0;
    },
  };
}

export type CategoryRepository = ReturnType<typeof createCategoryRepository>;
