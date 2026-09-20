import type { Brand, BrandListQuery, PageMeta } from '@catalog/shared';
import { ConflictError, NotFoundError } from '../errors.js';
import type { BrandRepository } from '../repositories/brand-repository.js';

export function createBrandService(repository: BrandRepository) {
  return {
    list({ page, pageSize }: BrandListQuery): { data: Brand[]; meta: PageMeta } {
      const { names, total } = repository.list({
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      return {
        data: names.map((name) => ({ name })),
        meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    },

    create(name: string): Brand {
      if (repository.exists(name)) {
        throw new ConflictError(`A brand "${name}" already exists`, [
          { path: 'name', message: 'is already in use' },
        ]);
      }
      repository.insert(name);
      return { name };
    },

    delete(name: string): void {
      if (!repository.exists(name)) throw new NotFoundError(`Brand "${name}" not found`);
      if (repository.productCount(name) > 0) {
        throw new ConflictError(`Brand "${name}" still has products`, [
          { path: 'brand', message: 'is still used by at least one product' },
        ]);
      }
      repository.delete(name);
    },
  };
}

export type BrandService = ReturnType<typeof createBrandService>;
