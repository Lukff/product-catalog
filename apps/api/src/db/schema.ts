import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
});

export const brands = sqliteTable('brands', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    // The wire contract exposes the category's slug; storage is a foreign key.
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    // Integer cents; the wire contract exposes a decimal `price` (see `Money` in packages/shared).
    priceCents: integer('price_cents').notNull(),
    stock: integer('stock').notNull(),
    // The wire contract exposes the brand's name; storage is a foreign key.
    brandId: integer('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    weight: real('weight').notNull(),
    // `meta.createdAt` / `meta.updatedAt` on the wire; ISO 8601 text, set by the service.
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('products_sku_unique').on(table.sku)],
);

export type BrandRow = typeof brands.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
