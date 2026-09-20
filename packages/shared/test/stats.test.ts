import { describe, expect, it } from 'vitest';
import { productStatsSchema } from '../src/index.js';

const valid = { total: 30, inStock: 20, lowStock: 6, outOfStock: 4, inventoryValue: 1234.5 };

describe('productStatsSchema', () => {
  it('accepts a full stats payload', () => {
    expect(productStatsSchema.parse(valid)).toEqual(valid);
  });

  it.each(['total', 'inStock', 'lowStock', 'outOfStock'] as const)(
    'rejects a negative or fractional %s',
    (field) => {
      expect(productStatsSchema.safeParse({ ...valid, [field]: -1 }).success).toBe(false);
      expect(productStatsSchema.safeParse({ ...valid, [field]: 1.5 }).success).toBe(false);
    },
  );

  it('rejects a negative inventory value', () => {
    expect(productStatsSchema.safeParse({ ...valid, inventoryValue: -0.01 }).success).toBe(false);
  });

  it('requires every field', () => {
    for (const field of Object.keys(valid)) {
      const partial: Record<string, number> = { ...valid };
      delete partial[field];
      expect(productStatsSchema.safeParse(partial).success, field).toBe(false);
    }
  });
});
