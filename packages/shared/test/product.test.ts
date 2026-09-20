import { describe, expect, it } from 'vitest';
import { createProductSchema, patchProductSchema, productSchema } from '../src/index.js';

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

const validRecord = {
  id: 1,
  ...validCreate,
  meta: { createdAt: '2026-09-19T10:00:00.000Z', updatedAt: '2026-09-19T10:00:00.000Z' },
};

/** Paths of every issue, for asserting which fields a rejection names. */
function failingPaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('createProductSchema', () => {
  it("accepts the brief's payload shape", () => {
    expect(createProductSchema.safeParse(validCreate).success).toBe(true);
  });

  it('rejects a negative price and names the price field', () => {
    const result = createProductSchema.safeParse({ ...validCreate, price: -1 });
    expect(result.success).toBe(false);
    expect(failingPaths(result)).toEqual(['price']);
    expect(result.error?.issues[0]?.message).toBe('must be >= 0');
  });

  it('accepts a price of zero', () => {
    expect(createProductSchema.safeParse({ ...validCreate, price: 0 }).success).toBe(true);
  });

  it('rejects a price with more than two decimal places', () => {
    const result = createProductSchema.safeParse({ ...validCreate, price: 19.999 });
    expect(result.success).toBe(false);
    expect(failingPaths(result)).toEqual(['price']);
    expect(result.error?.issues[0]?.message).toBe('must have at most 2 decimal places');
  });

  it('accepts prices that are awkward in binary floating point', () => {
    for (const price of [0.1, 0.07, 1.15, 4.35, 19.99]) {
      expect(createProductSchema.safeParse({ ...validCreate, price }).success, String(price)).toBe(
        true,
      );
    }
  });

  it('rejects a non-finite price', () => {
    expect(createProductSchema.safeParse({ ...validCreate, price: Infinity }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...validCreate, price: NaN }).success).toBe(false);
  });

  it('rejects a weight of zero and names the weight field', () => {
    const result = createProductSchema.safeParse({ ...validCreate, weight: 0 });
    expect(result.success).toBe(false);
    expect(failingPaths(result)).toEqual(['weight']);
    expect(result.error?.issues[0]?.message).toBe('must be > 0');
  });

  it('accepts a fractional weight', () => {
    expect(createProductSchema.safeParse({ ...validCreate, weight: 3.25 }).success).toBe(true);
  });

  it('rejects negative or fractional stock', () => {
    expect(failingPaths(createProductSchema.safeParse({ ...validCreate, stock: -1 }))).toEqual([
      'stock',
    ]);
    expect(failingPaths(createProductSchema.safeParse({ ...validCreate, stock: 1.5 }))).toEqual([
      'stock',
    ]);
  });

  it('accepts zero stock', () => {
    expect(createProductSchema.safeParse({ ...validCreate, stock: 0 }).success).toBe(true);
  });

  it('rejects a malformed category slug', () => {
    for (const category of ['Home Decor', 'home_decor', '-home', 'home-', 'home--decor', '']) {
      const result = createProductSchema.safeParse({ ...validCreate, category });
      expect(failingPaths(result), category).toEqual(['category']);
    }
  });

  it('accepts a multi-word slug', () => {
    expect(createProductSchema.safeParse({ ...validCreate, category: 'home-decor' }).success).toBe(
      true,
    );
  });

  it('enforces title length of 1-200 after trimming', () => {
    expect(failingPaths(createProductSchema.safeParse({ ...validCreate, title: '   ' }))).toEqual([
      'title',
    ]);
    expect(
      failingPaths(createProductSchema.safeParse({ ...validCreate, title: 'x'.repeat(201) })),
    ).toEqual(['title']);
    expect(createProductSchema.safeParse({ ...validCreate, title: 'x'.repeat(200) }).success).toBe(
      true,
    );
  });

  it('trims title, brand and sku', () => {
    const result = createProductSchema.parse({
      ...validCreate,
      title: '  Flux  ',
      brand: ' ACME ',
      sku: ' ACM-1 ',
    });
    expect(result.title).toBe('Flux');
    expect(result.brand).toBe('ACME');
    expect(result.sku).toBe('ACM-1');
  });

  it('enforces description length of 1-2000', () => {
    expect(
      failingPaths(createProductSchema.safeParse({ ...validCreate, description: '' })),
    ).toEqual(['description']);
    expect(
      failingPaths(
        createProductSchema.safeParse({ ...validCreate, description: 'x'.repeat(2001) }),
      ),
    ).toEqual(['description']);
    expect(
      createProductSchema.safeParse({ ...validCreate, description: 'x'.repeat(2000) }).success,
    ).toBe(true);
  });

  it('enforces brand and sku maximum lengths', () => {
    expect(
      failingPaths(createProductSchema.safeParse({ ...validCreate, brand: 'x'.repeat(101) })),
    ).toEqual(['brand']);
    expect(
      failingPaths(createProductSchema.safeParse({ ...validCreate, sku: 'x'.repeat(65) })),
    ).toEqual(['sku']);
  });

  it('reports every failing field at once', () => {
    const result = createProductSchema.safeParse({
      ...validCreate,
      price: -1,
      weight: 0,
      stock: -5,
    });
    expect(failingPaths(result).sort()).toEqual(['price', 'stock', 'weight']);
  });

  it('reports each missing required field', () => {
    const result = createProductSchema.safeParse({});
    expect(failingPaths(result).sort()).toEqual(
      ['brand', 'category', 'description', 'price', 'sku', 'stock', 'title', 'weight'].sort(),
    );
  });

  it('strips server-owned fields the client sends', () => {
    const result = createProductSchema.parse({
      ...validCreate,
      id: 999,
      meta: { createdAt: '1999-01-01T00:00:00.000Z', updatedAt: '1999-01-01T00:00:00.000Z' },
    });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('meta');
  });
});

describe('patchProductSchema', () => {
  it('accepts any single field', () => {
    expect(patchProductSchema.parse({ stock: 0 })).toEqual({ stock: 0 });
    expect(patchProductSchema.parse({ title: 'New' })).toEqual({ title: 'New' });
  });

  it('accepts the full set of fields', () => {
    expect(patchProductSchema.safeParse(validCreate).success).toBe(true);
  });

  it('applies the same field rules as create', () => {
    expect(failingPaths(patchProductSchema.safeParse({ price: -1 }))).toEqual(['price']);
    expect(failingPaths(patchProductSchema.safeParse({ weight: 0 }))).toEqual(['weight']);
    expect(failingPaths(patchProductSchema.safeParse({ price: 1.234 }))).toEqual(['price']);
  });

  it('rejects an empty patch', () => {
    const result = patchProductSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('must include at least one field');
  });

  it('rejects a patch that only carries stripped fields', () => {
    expect(patchProductSchema.safeParse({ id: 5 }).success).toBe(false);
  });

  it('strips server-owned fields alongside real ones', () => {
    const result = patchProductSchema.parse({ stock: 3, id: 5, meta: { createdAt: 'x' } });
    expect(result).toEqual({ stock: 3 });
  });

  it('does not fill in defaults for omitted fields', () => {
    expect(Object.keys(patchProductSchema.parse({ stock: 3 }))).toEqual(['stock']);
  });
});

describe('productSchema', () => {
  it('accepts a full server record', () => {
    expect(productSchema.safeParse(validRecord).success).toBe(true);
  });

  it('requires id and meta timestamps', () => {
    expect(failingPaths(productSchema.safeParse(validCreate))).toEqual(
      expect.arrayContaining(['id', 'meta']),
    );
  });

  it('rejects a non-ISO timestamp', () => {
    const result = productSchema.safeParse({
      ...validRecord,
      meta: { createdAt: 'yesterday', updatedAt: validRecord.meta.updatedAt },
    });
    expect(failingPaths(result)).toEqual(['meta.createdAt']);
  });
});
