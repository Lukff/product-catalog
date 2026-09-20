import type { Category } from '@catalog/shared';
import { createCategorySchema } from '@catalog/shared';
import { api, ApiError } from '../api.js';
import { catalog, type CatalogStore } from './catalog.svelte.js';

export type CategoriesStatus = 'loading' | 'ready' | 'error';

/** The most the API returns per page; the toolbar select shows this many. */
const LIST_SIZE = 100;

type CatalogFilter = Pick<CatalogStore, 'params' | 'update'>;

/** The category list behind the toolbar select, and the add/remove flows of the manager dialog. */
export class CategoriesStore {
  slugs = $state<string[]>([]);
  status = $state<CategoriesStatus>('loading');
  managerOpen = $state(false);
  pending = $state(false);
  /** Why the last add or remove failed, ready to show inline. */
  actionError = $state<string | null>(null);

  #catalog: CatalogFilter;

  constructor(catalog: CatalogFilter) {
    this.#catalog = catalog;
  }

  async load(): Promise<void> {
    this.status = 'loading';
    try {
      const response = await api.list<Category>('/categories', { query: { pageSize: LIST_SIZE } });
      this.slugs = response.data.map((category) => category.slug);
      this.status = 'ready';
    } catch {
      this.status = 'error';
    }
  }

  openManager(): void {
    this.actionError = null;
    this.managerOpen = true;
  }

  closeManager(): void {
    this.managerOpen = false;
  }

  /** Creates the category. Returns whether it worked; a refusal is recorded in `actionError`. */
  async add(input: string): Promise<boolean> {
    if (this.pending) return false;

    const parsed = createCategorySchema.safeParse({ slug: input.trim() });
    if (!parsed.success) {
      this.actionError = `Slug ${parsed.error.issues[0]?.message ?? 'is not valid'}`;
      return false;
    }

    return this.#run(async () => {
      await api.post<Category>('/categories', parsed.data);
      this.slugs = [...this.slugs, parsed.data.slug].sort();
    });
  }

  /**
   * Deletes the category. The server refuses while a product still uses it, which is recorded in
   * `actionError`. Removing the category the list is filtered by clears that filter.
   */
  async remove(slug: string): Promise<boolean> {
    if (this.pending) return false;

    return this.#run(async () => {
      await api.delete(`/categories/${slug}`);
      this.slugs = this.slugs.filter((existing) => existing !== slug);
      if (this.#catalog.params.category === slug) await this.#catalog.update({ category: '' });
    });
  }

  async #run(action: () => Promise<void>): Promise<boolean> {
    this.pending = true;
    this.actionError = null;
    try {
      await action();
      return true;
    } catch (cause) {
      this.actionError = cause instanceof ApiError ? cause.message : 'Could not reach the server';
      return false;
    } finally {
      this.pending = false;
    }
  }
}

export const categories = new CategoriesStore(catalog);
