import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
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
    price: real('price').notNull(),
    stock: integer('stock').notNull(),
    brand: text('brand').notNull(),
    sku: text('sku').notNull(),
    weight: real('weight').notNull(),
    // `meta.createdAt` / `meta.updatedAt` on the wire; ISO 8601 text, set by the service.
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('products_sku_unique').on(table.sku)],
);

export type CategoryRow = typeof categories.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
