import { describe, expect, it } from 'vitest';
import { createProductSchema, patchProductSchema, zodIssuesToDetails } from '../src/index.js';

const validCreate = {
  title: 'Large Flux Capacitor',
  description: 'Provides the maximum motive force.',
  category: 'automotive',
  price: 9.99,
  stock: 42,
  brand: 'ACME',
  sku: 'ACM-FC-001',
  weight: 4,
};

describe('zodIssuesToDetails', () => {
  it('maps a failing field to its path and message', () => {
    const result = createProductSchema.safeParse({ ...validCreate, price: -1 });
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(zodIssuesToDetails(result.error)).toEqual([{ path: 'price', message: 'must be >= 0' }]);
  });

  it('lists every failing field', () => {
    const result = createProductSchema.safeParse({ ...validCreate, price: -1, weight: 0 });
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(zodIssuesToDetails(result.error)).toEqual([
      { path: 'price', message: 'must be >= 0' },
      { path: 'weight', message: 'must be > 0' },
    ]);
  });

  it('joins nested paths with dots', () => {
    const details = zodIssuesToDetails({
      issues: [
        { path: ['meta', 'createdAt'], message: 'bad' },
        { path: ['items', 0, 'sku'], message: 'worse' },
      ],
    });
    expect(details).toEqual([
      { path: 'meta.createdAt', message: 'bad' },
      { path: 'items.0.sku', message: 'worse' },
    ]);
  });

  it('uses an empty path for an issue on the whole payload', () => {
    const result = patchProductSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(zodIssuesToDetails(result.error)).toEqual([
      { path: '', message: 'must include at least one field' },
    ]);
  });

  it('returns only path and message, nothing else zod attaches to an issue', () => {
    const result = createProductSchema.safeParse({ ...validCreate, price: -1 });
    expect(result.success).toBe(false);
    if (result.success) return;

    for (const detail of zodIssuesToDetails(result.error)) {
      expect(Object.keys(detail).sort()).toEqual(['message', 'path']);
    }
  });
});
