import { z } from 'zod';

const count = z.number().int('must be an integer').min(0, 'must be >= 0');

/**
 * Catalog-wide headline numbers from `GET /api/products/stats`. Not scoped by the list's search or
 * category, so the metric strip stays a stable overview. `total` is `inStock + lowStock + outOfStock`.
 */
export const productStatsSchema = z.object({
  total: count,
  inStock: count,
  lowStock: count,
  outOfStock: count,
  /** Sum of `price * stock`, rounded to 2 decimals. */
  inventoryValue: z.number().min(0, 'must be >= 0'),
});

export type ProductStats = z.infer<typeof productStatsSchema>;
