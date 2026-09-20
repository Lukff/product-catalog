import { z } from 'zod';

/** A product with at most this many units left (and at least one) is "low stock". */
export const LOW_STOCK_THRESHOLD = 5;

export const STOCK_STATUSES = ['out', 'low', 'in'] as const;

export type StockStatus = (typeof STOCK_STATUSES)[number];

/** The values `?stockStatus=` may take. */
export const stockStatusSchema = z.enum(STOCK_STATUSES, {
  error: `must be one of ${STOCK_STATUSES.join(', ')}`,
});

/** Derives the stock status shown in the UI. Not a wire field: the API never sends it. */
export function stockStatus(stock: number): StockStatus {
  if (stock <= 0) return 'out';
  return stock <= LOW_STOCK_THRESHOLD ? 'low' : 'in';
}
