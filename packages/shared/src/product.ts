import { z } from 'zod';

const CATEGORY_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A lowercase slug such as `automotive` or `home-decor`. Shared with the list-query `category` filter. */
export const categorySlugSchema = z
  .string()
  .max(50, 'must be at most 50 characters')
  .regex(CATEGORY_SLUG, 'must be a lowercase slug (letters, digits and single hyphens)');

/** Trimmed, non-empty text with an upper length bound. */
const text = (max: number) =>
  z.string().trim().min(1, 'is required').max(max, `must be at most ${max} characters`);

const hasAtMostTwoDecimals = (value: number) => Number(value.toFixed(2)) === value;

/** Fields a client supplies when creating or replacing part of a product. */
const editableFields = {
  title: text(200),
  description: z.string().min(1, 'is required').max(2000, 'must be at most 2000 characters'),
  category: categorySlugSchema,
  price: z
    .number()
    .min(0, 'must be >= 0')
    .refine(hasAtMostTwoDecimals, 'must have at most 2 decimal places'),
  stock: z.number().int('must be an integer').min(0, 'must be >= 0'),
  brand: text(100),
  sku: text(64),
  weight: z.number().gt(0, 'must be > 0'),
};

/**
 * Body of `POST /api/products`. Server-owned fields (`id`, `meta`) are stripped
 * if a client sends them.
 */
export const createProductSchema = z.object(editableFields);

/** Body of `PATCH /api/products/:id`: any non-empty subset of the create fields. */
export const patchProductSchema = createProductSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'must include at least one field');

/** A product as returned by the API. `meta` is re-nested from flat storage columns. */
export const productSchema = createProductSchema.extend({
  id: z.number().int().positive(),
  meta: z.object({
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
});

export type Product = z.infer<typeof productSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type PatchProductInput = z.infer<typeof patchProductSchema>;
