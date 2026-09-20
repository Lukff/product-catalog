import {
  parseSort,
  type CreateProductInput,
  type ListQuery,
  type PageMeta,
  type PatchProductInput,
  type Product,
  type ProductStats,
} from '@catalog/shared';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { ProductRecord, ProductRepository } from '../repositories/product-repository.js';

/** Re-nests the flat timestamp columns as `meta`, the shape the brief's payload uses. */
export function toProduct(record: ProductRecord): Product {
  const { createdAt, updatedAt, ...fields } = record;
  return { ...fields, meta: { createdAt, updatedAt } };
}

export function createProductService(
  repository: ProductRepository,
  now: () => Date = () => new Date(),
) {
  const get = (id: number): Product => {
    const record = repository.findById(id);
    if (!record) throw new NotFoundError(`Product ${id} not found`);
    return toProduct(record);
  };

  return {
    get,

    create(input: CreateProductInput): Product {
      const categoryId = repository.findCategoryId(input.category);
      if (categoryId === undefined) {
        throw new ValidationError('Invalid product payload', [
          { path: 'category', message: `"${input.category}" is not an existing category` },
        ]);
      }
      if (repository.skuExists(input.sku)) {
        throw new ConflictError(`A product with SKU "${input.sku}" already exists`, [
          { path: 'sku', message: 'is already in use' },
        ]);
      }

      const timestamp = now().toISOString();
      const id = repository.insert({
        title: input.title,
        description: input.description,
        categoryId,
        price: input.price,
        stock: input.stock,
        brand: input.brand,
        sku: input.sku,
        weight: input.weight,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return get(id);
    },

    update(id: number, patch: PatchProductInput): Product {
      if (!repository.findById(id)) throw new NotFoundError(`Product ${id} not found`);

      const { category, ...fields } = patch;
      let categoryId: number | undefined;
      if (category !== undefined) {
        categoryId = repository.findCategoryId(category);
        if (categoryId === undefined) {
          throw new ValidationError('Invalid product payload', [
            { path: 'category', message: `"${category}" is not an existing category` },
          ]);
        }
      }
      if (fields.sku !== undefined && repository.skuExists(fields.sku, id)) {
        throw new ConflictError(`A product with SKU "${fields.sku}" already exists`, [
          { path: 'sku', message: 'is already in use' },
        ]);
      }

      repository.update(id, { ...fields, categoryId, updatedAt: now().toISOString() });
      return get(id);
    },

    delete(id: number): void {
      if (!repository.delete(id)) throw new NotFoundError(`Product ${id} not found`);
    },

    stats: (): ProductStats => repository.stats(),

    list({ page, pageSize, q, category, stockStatus, sort }: ListQuery): {
      data: Product[];
      meta: PageMeta;
    } {
      const { rows, total } = repository.list({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        q,
        category,
        stockStatus,
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
