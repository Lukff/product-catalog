import { describe, expect, it } from 'vitest';
import { SORT_FIELDS, listQuerySchema, parseSort } from '../src/index.js';

describe('listQuerySchema', () => {
  it('applies defaults when no params are given', () => {
    const result = listQuerySchema.parse({});
    expect(result).toEqual({ page: 1, pageSize: 30 });
  });

  it('coerces numeric strings from the query string', () => {
    const result = listQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it('accepts pageSize at the cap of 100', () => {
    expect(listQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(100);
  });

  it('rejects pageSize above 100 instead of clamping', () => {
    const result = listQuerySchema.safeParse({ pageSize: '101' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['pageSize']);
  });

  it.each(['0', '-1', 'abc', '1.5'])('rejects page=%s', (page) => {
    const result = listQuerySchema.safeParse({ page });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['page']);
  });

  it.each(['0', 'abc', '2.5'])('rejects pageSize=%s', (pageSize) => {
    const result = listQuerySchema.safeParse({ pageSize });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['pageSize']);
  });

  it('trims q and treats a blank q as absent', () => {
    expect(listQuerySchema.parse({ q: '  flux  ' }).q).toBe('flux');
    expect(listQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
    expect(listQuerySchema.parse({ q: '' }).q).toBeUndefined();
  });

  it('accepts a slug category and rejects a malformed one', () => {
    expect(listQuerySchema.parse({ category: 'home-decor' }).category).toBe('home-decor');
    const result = listQuerySchema.safeParse({ category: 'Home Decor' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['category']);
  });

  describe('sort', () => {
    it.each(SORT_FIELDS)('accepts ascending and descending %s', (field) => {
      expect(listQuerySchema.parse({ sort: field }).sort).toBe(field);
      expect(listQuerySchema.parse({ sort: `-${field}` }).sort).toBe(`-${field}`);
    });

    it('rejects a field outside the whitelist', () => {
      const result = listQuerySchema.safeParse({ sort: 'bogus' });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['sort']);
    });

    it('rejects a descending prefix on an unknown field', () => {
      expect(listQuerySchema.safeParse({ sort: '-bogus' }).success).toBe(false);
    });

    it('rejects the whitelist names in the wrong case', () => {
      expect(listQuerySchema.safeParse({ sort: 'createdat' }).success).toBe(false);
    });
  });
});

describe('parseSort', () => {
  it('parses an ascending field', () => {
    expect(parseSort('stock')).toEqual({ field: 'stock', direction: 'asc' });
  });

  it('parses a leading minus as descending', () => {
    expect(parseSort('-price')).toEqual({ field: 'price', direction: 'desc' });
  });
});
