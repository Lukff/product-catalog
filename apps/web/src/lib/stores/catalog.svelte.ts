import { DEFAULT_PAGE_SIZE, type PageMeta, type Product } from '@catalog/shared';
import { api, ApiError } from '../api.js';

export type CatalogStatus = 'loading' | 'ready' | 'error';

/** Query state that drives the list. Search, sort and category join it in B-08. */
export interface CatalogParams {
  page: number;
  pageSize: number;
}

/** Query params and results for the product list. */
export class CatalogStore {
  params = $state<CatalogParams>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  status = $state<CatalogStatus>('loading');
  products = $state<Product[]>([]);
  meta = $state<PageMeta | null>(null);
  error = $state<ApiError | null>(null);

  #inFlight: AbortController | undefined;

  /** Fetches the list for the current params. A newer call supersedes an older one. */
  async load(): Promise<void> {
    this.#inFlight?.abort();
    const request = new AbortController();
    this.#inFlight = request;

    this.status = 'loading';
    this.error = null;

    try {
      const response = await api.list<Product>('/products', {
        query: { page: this.params.page, pageSize: this.params.pageSize },
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
