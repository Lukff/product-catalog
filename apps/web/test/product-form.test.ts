import type { Product } from '@catalog/shared';
import { describe, expect, it } from 'vitest';
import {
  changedFields,
  detailsToFieldErrors,
  EMPTY_VALUES,
  validateProductForm,
  valuesFromProduct,
  type ProductFormValues,
} from '../src/lib/product-form.js';

const valid: ProductFormValues = {
  title: '  Rocket Skates ',
  description: 'Blast off.',
  category: 'automotive',
  brand: 'ACME',
  sku: 'ACM-1',
  price: '19.99',
  stock: '3',
  weight: '2.5',
};

function errorsFor(overrides: Partial<ProductFormValues>) {
  const result = validateProductForm({ ...valid, ...overrides });
  if (result.ok) throw new Error('expected the form to be invalid');
  return result.errors;
}

describe('validateProductForm', () => {
  it('turns valid values into a typed, trimmed input', () => {
    expect(validateProductForm(valid)).toEqual({
      ok: true,
      input: {
        title: 'Rocket Skates',
        description: 'Blast off.',
        category: 'automotive',
        brand: 'ACME',
        sku: 'ACM-1',
        price: 19.99,
        stock: 3,
        weight: 2.5,
      },
    });
  });

  it('marks every blank required field', () => {
    const result = validateProductForm(EMPTY_VALUES);
    expect(result).toMatchObject({ ok: false });
    expect(Object.keys((result as { errors: object }).errors).sort()).toEqual([
      'brand',
      'category',
      'description',
      'price',
      'sku',
      'stock',
      'title',
      'weight',
    ]);
    expect(errorsFor({ price: '  ', category: '' })).toMatchObject({
      price: 'is required',
      category: 'is required',
    });
  });

  it('rejects text that is not a number', () => {
    expect(errorsFor({ price: 'abc' })).toEqual({ price: 'must be a number' });
    expect(errorsFor({ weight: 'Infinity' })).toEqual({ weight: 'must be a number' });
  });

  it.each([
    [{ price: '-1' }, { price: 'must be >= 0' }],
    [{ price: '9.999' }, { price: 'must have at most 2 decimal places' }],
    [{ stock: '1.5' }, { stock: 'must be an integer' }],
    [{ stock: '-2' }, { stock: 'must be >= 0' }],
    [{ weight: '0' }, { weight: 'must be > 0' }],
  ])('uses the shared schema message for %j', (overrides, expected) => {
    expect(errorsFor(overrides)).toEqual(expected);
  });

  it('rejects a category that is not a lowercase slug with the shared message', () => {
    expect(errorsFor({ category: 'Home Decor' }).category).toContain('lowercase slug');
  });

  it('reports several problems at once', () => {
    expect(Object.keys(errorsFor({ price: '-1', title: '', weight: '0' })).sort()).toEqual([
      'price',
      'title',
      'weight',
    ]);
  });
});

describe('detailsToFieldErrors', () => {
  it('maps details onto form fields, first message per field', () => {
    expect(
      detailsToFieldErrors([
        { path: 'sku', message: 'is already in use' },
        { path: 'sku', message: 'ignored' },
        { path: 'price', message: 'must be >= 0' },
      ]),
    ).toEqual({ fields: { sku: 'is already in use', price: 'must be >= 0' }, unmatched: [] });
  });

  it('keeps details for the whole payload or unknown fields as unmatched', () => {
    const whole = { path: '', message: 'must be valid JSON' };
    const unknown = { path: 'colour', message: 'nope' };

    expect(detailsToFieldErrors([whole, unknown])).toEqual({
      fields: {},
      unmatched: [whole, unknown],
    });
  });
});

const stored: Product = {
  id: 5,
  title: 'Rocket Skates',
  description: 'Blast off.',
  category: 'automotive',
  price: 19.99,
  stock: 3,
  brand: 'ACME',
  sku: 'ACM-1',
  weight: 2.5,
  meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
};

describe('valuesFromProduct', () => {
  it('turns every form field into the string a user would have typed', () => {
    expect(valuesFromProduct(stored)).toEqual({
      title: 'Rocket Skates',
      description: 'Blast off.',
      category: 'automotive',
      brand: 'ACME',
      sku: 'ACM-1',
      price: '19.99',
      stock: '3',
      weight: '2.5',
    });
  });

  it('round-trips through the form validation to the same values', () => {
    const result = validateProductForm(valuesFromProduct(stored));

    expect(result).toMatchObject({
      ok: true,
      input: { price: 19.99, stock: 3, weight: 2.5, title: 'Rocket Skates' },
    });
  });
});

describe('changedFields', () => {
  function inputFrom(overrides: Record<string, unknown> = {}) {
    const result = validateProductForm({ ...valuesFromProduct(stored), ...overrides });
    if (!result.ok) throw new Error('expected a valid form');
    return result.input;
  }

  it('is empty when nothing changed', () => {
    expect(changedFields(stored, inputFrom())).toEqual({});
  });

  it('holds only the fields that changed', () => {
    expect(changedFields(stored, inputFrom({ price: '7.5', stock: '0' }))).toEqual({
      price: 7.5,
      stock: 0,
    });
  });

  it('does not count a number typed differently as a change', () => {
    expect(changedFields(stored, inputFrom({ price: '19.990', weight: '2.50' }))).toEqual({});
  });

  it('treats surrounding whitespace in a trimmed field as no change', () => {
    expect(changedFields(stored, inputFrom({ title: '  Rocket Skates  ' }))).toEqual({});
  });

  it('includes a changed category and sku', () => {
    expect(changedFields(stored, inputFrom({ category: 'tools', sku: 'ACM-2' }))).toEqual({
      category: 'tools',
      sku: 'ACM-2',
    });
  });
});
