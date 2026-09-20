import { describe, expect, it } from 'vitest';
import { categorySchema, createCategorySchema, toJSONSchema } from '../src/index.js';

describe('createCategorySchema', () => {
  it('accepts a slug', () => {
    expect(createCategorySchema.parse({ slug: 'home-decor' })).toEqual({ slug: 'home-decor' });
  });

  it('applies the same slug rules as the product category', () => {
    for (const slug of ['Home Decor', 'home_decor', '-home', 'home--decor', '']) {
      const result = createCategorySchema.safeParse({ slug });
      expect(result.success, slug).toBe(false);
      expect(result.error?.issues[0]?.path, slug).toEqual(['slug']);
    }
  });

  it('requires a slug', () => {
    const result = createCategorySchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['slug']);
  });

  it('strips fields the client must not set, such as the surrogate id', () => {
    expect(createCategorySchema.parse({ slug: 'tools', id: 9 })).toEqual({ slug: 'tools' });
  });
});

describe('categorySchema', () => {
  it('is the wire shape: a slug and nothing else', () => {
    expect(categorySchema.parse({ slug: 'tools', id: 9 })).toEqual({ slug: 'tools' });
  });
});

describe('toJSONSchema', () => {
  it('turns a shared schema into JSON Schema', () => {
    expect(toJSONSchema(createCategorySchema, { io: 'input' })).toMatchObject({
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' } },
    });
  });
});
