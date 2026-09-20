// packages/shared/test/product-id.test.ts
import { describe, expect, it } from 'vitest';
import { productIdParamSchema } from '../src/index.js';

function failure(id: string) {
  const result = productIdParamSchema.safeParse({ id });
  if (result.success) throw new Error(`expected "${id}" to be rejected`);
  return result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

describe('productIdParamSchema', () => {
  it('coerces a numeric string to a number', () => {
    expect(productIdParamSchema.parse({ id: '7' })).toEqual({ id: 7 });
  });

  it.each(['abc', '1.5', 'NaN'])('rejects %s as not an integer', (id) => {
    expect(failure(id)).toEqual([{ path: 'id', message: 'must be an integer' }]);
  });

  it.each(['0', '-3'])('rejects %s as below 1', (id) => {
    expect(failure(id)).toEqual([{ path: 'id', message: 'must be >= 1' }]);
  });
});
