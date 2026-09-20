import { z } from 'zod';
import { brandNameSchema, categorySlugSchema } from './product.js';
import { stockStatusSchema } from './stock.js';

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

/** Fields `?sort=` may name. Anything else is a validation error. */
export const SORT_FIELDS = ['title', 'price', 'stock', 'weight', 'createdAt', 'updatedAt'] as const;

export type SortField = (typeof SORT_FIELDS)[number];
/** A sort field, with a leading `-` meaning descending: `price`, `-price`. */
export type SortParam = SortField | `-${SortField}`;

const sortSchema = z.enum(
  SORT_FIELDS.flatMap((field) => [field, `-${field}`] as const),
  { error: `must be one of ${SORT_FIELDS.join(', ')}, optionally prefixed with "-"` },
);

/**
 * Query string of `GET /api/products`. Values arrive as strings and are coerced.
 * Out-of-range values are rejected, not clamped.
 */
export const listQuerySchema = z.object({
  page: z.coerce.number().int('must be an integer').min(1, 'must be >= 1').default(1),
  pageSize: z.coerce
    .number()
    .int('must be an integer')
    .min(1, 'must be >= 1')
    .max(MAX_PAGE_SIZE, `must be <= ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
  q: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  category: categorySlugSchema.optional(),
  brand: brandNameSchema.optional(),
  stockStatus: stockStatusSchema.optional(),
  sort: sortSchema.optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export interface ParsedSort {
  field: SortField;
  direction: 'asc' | 'desc';
}

export function parseSort(sort: SortParam): ParsedSort {
  const descending = sort.startsWith('-');
  const field = (descending ? sort.slice(1) : sort) as SortField;
  return { field, direction: descending ? 'desc' : 'asc' };
}
