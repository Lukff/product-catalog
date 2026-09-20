import { z } from 'zod';
import { categorySlugSchema } from './product.js';

/**
 * Body of `POST /api/categories`. A category is identified on the wire by its
 * slug alone; the surrogate `id` is storage-only and is stripped if a client sends it.
 */
export const createCategorySchema = z.object({ slug: categorySlugSchema });

/** A category as returned by the API. */
export const categorySchema = z.object({ slug: categorySlugSchema });

export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
