import type { Brand } from '@catalog/shared';
import { createBrandSchema } from '@catalog/shared';
import { api, ApiError } from '../api.js';
import { catalog, type CatalogStore } from './catalog.svelte.js';

export type BrandsStatus = 'loading' | 'ready' | 'error';

/** The most the API returns per page; the toolbar select shows this many. */
const LIST_SIZE = 100;

type CatalogFilter = Pick<CatalogStore, 'params' | 'update'>;

/** The brand list behind the toolbar and form selects, and the add/remove flows of the manager dialog. */
export class BrandsStore {
  names = $state<string[]>([]);
  status = $state<BrandsStatus>('loading');
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
      const response = await api.list<Brand>('/brands', { query: { pageSize: LIST_SIZE } });
      this.names = response.data.map((brand) => brand.name);
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

  /** Creates the brand. Returns whether it worked; a refusal is recorded in `actionError`. */
  async add(input: string): Promise<boolean> {
    if (this.pending) return false;

    const parsed = createBrandSchema.safeParse({ name: input.trim() });
    if (!parsed.success) {
      this.actionError = `Name ${parsed.error.issues[0]?.message ?? 'is not valid'}`;
      return false;
    }

    return this.#run(async () => {
      await api.post<Brand>('/brands', parsed.data);
      this.names = [...this.names, parsed.data.name].sort();
    });
  }

  /**
   * Deletes the brand. The server refuses while a product still uses it, which is recorded in
   * `actionError`. Removing the brand the list is filtered by clears that filter.
   */
  async remove(name: string): Promise<boolean> {
    if (this.pending) return false;

    return this.#run(async () => {
      await api.delete(`/brands/${encodeURIComponent(name)}`);
      this.names = this.names.filter((existing) => existing !== name);
      if (this.#catalog.params.brand === name) await this.#catalog.update({ brand: '' });
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

export const brands = new BrandsStore(catalog);
