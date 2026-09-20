import { z } from 'zod';
import { brandNameSchema } from './product.js';
import { listQuerySchema } from './query.js';

/**
 * Body of `POST /api/brands`. A brand is identified on the wire by its name alone;
 * the surrogate `id` is storage-only and is stripped if a client sends it.
 */
export const createBrandSchema = z.object({ name: brandNameSchema });

/** `:name` path parameter of `DELETE /api/brands/:name`. */
export const brandNameParamSchema = z.object({ name: brandNameSchema });

/** Query string of `GET /api/brands`: the paging half of the product list query. */
export const brandListQuerySchema = listQuerySchema.pick({ page: true, pageSize: true });

/** A brand as returned by the API. */
export const brandSchema = z.object({ name: brandNameSchema });

export type Brand = z.infer<typeof brandSchema>;
export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type BrandListQuery = z.infer<typeof brandListQuerySchema>;
