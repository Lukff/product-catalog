/** A product with at most this many units left (and at least one) is "low stock". */
export const LOW_STOCK_THRESHOLD = 5;

export type StockStatus = 'out' | 'low' | 'in';

/** Derives the stock status shown in the UI. Not a wire field: the API never sends it. */
export function stockStatus(stock: number): StockStatus {
  if (stock <= 0) return 'out';
  return stock <= LOW_STOCK_THRESHOLD ? 'low' : 'in';
}
