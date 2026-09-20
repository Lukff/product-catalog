import type { PageMeta, Product } from '@catalog/shared';
import { api, ApiError } from '../api.js';
import { DEFAULT_PARAMS, type CatalogParams } from '../query-params.js';

export type CatalogStatus = 'loading' | 'ready' | 'error';

/** Query params and results for the product list. */
export class CatalogStore {
  params = $state<CatalogParams>({ ...DEFAULT_PARAMS });
  status = $state<CatalogStatus>('loading');
  products = $state<Product[]>([]);
  meta = $state<PageMeta | null>(null);
  error = $state<ApiError | null>(null);

  #inFlight: AbortController | undefined;

  /** Changes some params and reloads. Any change but a page turn goes back to page 1. */
  update(patch: Partial<CatalogParams>): Promise<void> {
    this.params = { ...this.params, page: 1, ...patch };
    return this.load();
  }

  /** Replaces every param at once, as when the URL changes under back/forward navigation. */
  applyParams(params: CatalogParams): Promise<void> {
    this.params = { ...params };
    return this.load();
  }

  /** Fetches the list for the current params. A newer call supersedes an older one. */
  async load(): Promise<void> {
    this.#inFlight?.abort();
    const request = new AbortController();
    this.#inFlight = request;

    this.status = 'loading';
    this.error = null;

    try {
      const response = await api.list<Product>('/products', {
        query: {
          page: this.params.page,
          pageSize: this.params.pageSize,
          q: this.params.q,
          category: this.params.category,
          sort: this.params.sort,
        },
        signal: request.signal,
      });
      if (request.signal.aborted) return;

      this.products = response.data;
      this.meta = response.meta;
      this.status = 'ready';
    } catch (cause) {
      // A superseded request is not a failure; the newer one owns the state.
      if (request.signal.aborted) return;

      this.error =
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
      this.status = 'error';
    }
  }
}

export const catalog = new CatalogStore();
