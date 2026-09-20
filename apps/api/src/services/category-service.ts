import type { Category, CategoryListQuery, PageMeta } from '@catalog/shared';
import { ConflictError, NotFoundError } from '../errors.js';
import type { CategoryRepository } from '../repositories/category-repository.js';

export function createCategoryService(repository: CategoryRepository) {
  return {
    list({ page, pageSize }: CategoryListQuery): { data: Category[]; meta: PageMeta } {
      const { slugs, total } = repository.list({
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      return {
        data: slugs.map((slug) => ({ slug })),
        meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    },

    create(slug: string): Category {
      if (repository.exists(slug)) {
        throw new ConflictError(`A category "${slug}" already exists`, [
          { path: 'slug', message: 'is already in use' },
        ]);
      }
      repository.insert(slug);
      return { slug };
    },

    delete(slug: string): void {
      if (!repository.exists(slug)) throw new NotFoundError(`Category "${slug}" not found`);
      if (repository.productCount(slug) > 0) {
        throw new ConflictError(`Category "${slug}" still has products`, [
          { path: 'category', message: 'is still used by at least one product' },
        ]);
      }
      repository.delete(slug);
    },
  };
}

export type CategoryService = ReturnType<typeof createCategoryService>;
