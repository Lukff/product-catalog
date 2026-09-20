import type { ListQuery, PageMeta, Product } from '@catalog/shared';
import type { ProductRecord, ProductRepository } from '../repositories/product-repository.js';

/** Re-nests the flat timestamp columns as `meta`, the shape the brief's payload uses. */
export function toProduct(record: ProductRecord): Product {
  const { createdAt, updatedAt, ...fields } = record;
  return { ...fields, meta: { createdAt, updatedAt } };
}

export function createProductService(repository: ProductRepository) {
  return {
    list({ page, pageSize }: Pick<ListQuery, 'page' | 'pageSize'>): {
      data: Product[];
      meta: PageMeta;
    } {
      const { rows, total } = repository.list({ limit: pageSize, offset: (page - 1) * pageSize });

      return {
        data: rows.map(toProduct),
        meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    },
  };
}

export type ProductService = ReturnType<typeof createProductService>;
