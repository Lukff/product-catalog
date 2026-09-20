import { parseSort, type ListQuery, type PageMeta, type Product } from '@catalog/shared';
import { NotFoundError } from '../errors.js';
import type { ProductRecord, ProductRepository } from '../repositories/product-repository.js';

/** Re-nests the flat timestamp columns as `meta`, the shape the brief's payload uses. */
export function toProduct(record: ProductRecord): Product {
  const { createdAt, updatedAt, ...fields } = record;
  return { ...fields, meta: { createdAt, updatedAt } };
}

export function createProductService(repository: ProductRepository) {
  return {
    get(id: number): Product {
      const record = repository.findById(id);
      if (!record) throw new NotFoundError(`Product ${id} not found`);
      return toProduct(record);
    },

    list({ page, pageSize, q, category, sort }: ListQuery): { data: Product[]; meta: PageMeta } {
      const { rows, total } = repository.list({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        q,
        category,
        sort: sort ? parseSort(sort) : undefined,
      });

      return {
        data: rows.map(toProduct),
        meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    },
  };
}

export type ProductService = ReturnType<typeof createProductService>;
