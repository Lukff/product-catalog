import { z } from 'zod';
import { categorySlugSchema } from './product.js';
import { listQuerySchema } from './query.js';

/**
 * Body of `POST /api/categories`. A category is identified on the wire by its
 * slug alone; the surrogate `id` is storage-only and is stripped if a client sends it.
 */
export const createCategorySchema = z.object({ slug: categorySlugSchema });

/** `:slug` path parameter of `DELETE /api/categories/:slug`. */
export const categorySlugParamSchema = z.object({ slug: categorySlugSchema });

/** Query string of `GET /api/categories`: the paging half of the product list query. */
export const categoryListQuerySchema = listQuerySchema.pick({ page: true, pageSize: true });

/** A category as returned by the API. */
export const categorySchema = z.object({ slug: categorySlugSchema });

export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
