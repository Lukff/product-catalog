import { asc, count, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { brands, products } from '../db/schema.js';

export interface BrandPage {
  names: string[];
  total: number;
}

export function createBrandRepository(db: Db) {
  return {
    /** One page of brand names in alphabetical order, plus the total number of brands. */
    list({ limit, offset }: { limit: number; offset: number }): BrandPage {
      const names = db
        .select({ name: brands.name })
        .from(brands)
        .orderBy(asc(brands.name))
        .limit(limit)
        .offset(offset)
        .all()
        .map((row) => row.name);
      const total = db.select({ total: count() }).from(brands).get()?.total ?? 0;

      return { names, total };
    },

    /** True when a brand with this name exists. */
    exists(name: string): boolean {
      return (
        db.select({ id: brands.id }).from(brands).where(eq(brands.name, name)).get() !== undefined
      );
    },

    /** Inserts the brand. Callers check `exists` first; a duplicate name violates the unique index. */
    insert(name: string): void {
      db.insert(brands).values({ name }).run();
    },

    /** How many products belong to the brand with this name. */
    productCount(name: string): number {
      return (
        db
          .select({ total: count() })
          .from(products)
          .innerJoin(brands, eq(products.brandId, brands.id))
          .where(eq(brands.name, name))
          .get()?.total ?? 0
      );
    },

    /** Removes the brand. Returns whether a row was removed. */
    delete(name: string): boolean {
      return db.delete(brands).where(eq(brands.name, name)).run().changes > 0;
    },
  };
}

export type BrandRepository = ReturnType<typeof createBrandRepository>;
