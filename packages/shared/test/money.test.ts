import { describe, expect, it } from 'vitest';
import {
  createProductSchema,
  formatMoney,
  fromCents,
  isMoney,
  sumCents,
  toCents,
} from '../src/index.js';

describe('toCents', () => {
  it.each([
    [0, 0],
    [0.01, 1],
    [0.29, 29],
    [1.1, 110],
    [19.99, 1999],
    [1234.5, 123450],
    [4503599627370, 450359962737000],
  ])('%s -> %s', (price, cents) => {
    expect(toCents(price)).toBe(cents);
  });

  it('is exact where floating-point multiplication is not', () => {
    expect(0.29 * 100).not.toBe(29);
    expect(toCents(0.29)).toBe(29);
    expect(toCents(1.15)).toBe(115);
  });
});

describe('fromCents', () => {
  it.each([
    [0, 0],
    [1, 0.01],
    [1999, 19.99],
    [123450, 1234.5],
  ])('%s -> %s', (cents, price) => {
    expect(fromCents(cents)).toBe(price);
  });

  it('round-trips through toCents', () => {
    for (let cents = 0; cents <= 100_000; cents += 7) {
      expect(toCents(fromCents(cents))).toBe(cents);
    }
  });
});

describe('sumCents', () => {
  it('adds integer cents exactly where float prices drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(fromCents(sumCents([toCents(0.1), toCents(0.2)]))).toBe(0.3);
  });

  it('is 0 for no terms', () => {
    expect(sumCents([])).toBe(0);
  });
});

describe('isMoney', () => {
  it.each([0, 0.1, 0.2, 0.3, 19.99, 100, 1234.56])('accepts %s', (value) => {
    expect(isMoney(value)).toBe(true);
  });

  it.each([
    [1.005, 'more than 2 decimals'],
    [0.001, 'more than 2 decimals'],
    [19.999, 'more than 2 decimals'],
    [Number.NaN, 'NaN'],
    [Number.POSITIVE_INFINITY, 'Infinity'],
    [1e20, 'beyond safe integer cents'],
    [Number.MAX_SAFE_INTEGER, 'beyond safe integer cents'],
  ])('rejects %s (%s)', (value) => {
    expect(isMoney(value)).toBe(false);
  });
});

describe('formatMoney', () => {
  it('formats as USD with two decimals', () => {
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(19.9)).toBe('$19.90');
    expect(formatMoney(1234567.89)).toBe('$1,234,567.89');
  });
});

describe('product price validation', () => {
  const base = {
    title: 'Widget',
    description: 'A widget',
    category: 'tools',
    stock: 1,
    brand: 'Acme',
    sku: 'W-1',
    weight: 1,
  };

  it('rejects a price that loses precision, without rounding it', () => {
    const result = createProductSchema.safeParse({ ...base, price: 1.005 });
    expect(result.success).toBe(false);
  });

  it('rejects a price too large to hold as integer cents', () => {
    expect(createProductSchema.safeParse({ ...base, price: 1e20 }).success).toBe(false);
  });

  it('accepts 0.1 + 0.2 style values only when exact', () => {
    expect(createProductSchema.safeParse({ ...base, price: 0.3 }).success).toBe(true);
    expect(createProductSchema.safeParse({ ...base, price: 0.1 + 0.2 }).success).toBe(false);
  });
});
