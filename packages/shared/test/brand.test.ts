import { describe, expect, it } from 'vitest';
import {
  brandListQuerySchema,
  brandNameParamSchema,
  brandSchema,
  createBrandSchema,
  DEFAULT_PAGE_SIZE,
  listQuerySchema,
} from '../src/index.js';

describe('createBrandSchema', () => {
  it('accepts a name and trims it', () => {
    expect(createBrandSchema.parse({ name: '  Acme Corp ' })).toEqual({ name: 'Acme Corp' });
  });

  it('rejects a blank name, an over-long name and a name with a slash', () => {
    for (const name of ['', '   ', 'x'.repeat(101), 'AC/DC']) {
      const result = createBrandSchema.safeParse({ name });
      expect(result.success, name).toBe(false);
      expect(result.error?.issues[0]?.path, name).toEqual(['name']);
    }
  });

  it('requires a name', () => {
    const result = createBrandSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['name']);
  });

  it('strips fields the client must not set, such as the surrogate id', () => {
    expect(createBrandSchema.parse({ name: 'ACME', id: 9 })).toEqual({ name: 'ACME' });
  });
});

describe('brandSchema', () => {
  it('is the wire shape: a name and nothing else', () => {
    expect(brandSchema.parse({ name: 'ACME', id: 9 })).toEqual({ name: 'ACME' });
  });
});

describe('brandNameParamSchema', () => {
  it('applies the same name rules as the product brand', () => {
    expect(brandNameParamSchema.parse({ name: 'Acme Corp' })).toEqual({ name: 'Acme Corp' });
    expect(brandNameParamSchema.safeParse({ name: 'AC/DC' }).success).toBe(false);
  });
});

describe('brandListQuerySchema', () => {
  it('defaults to the first page at the default page size and bounds pageSize', () => {
    expect(brandListQuerySchema.parse({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    expect(brandListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });
});

describe('listQuerySchema brand filter', () => {
  it('accepts a brand name and rejects a blank one', () => {
    expect(listQuerySchema.parse({ brand: 'Acme Corp' }).brand).toBe('Acme Corp');
    expect(listQuerySchema.safeParse({ brand: ' ' }).success).toBe(false);
  });
});
