import type { CreateProductInput, Product } from '@catalog/shared';
import { api, ApiError } from '../api.js';
import { catalog, type CatalogStore } from './catalog.svelte.js';

export type DialogView =
  { kind: 'closed' } | { kind: 'create' } | { kind: 'detail'; product: Product };

export type DetailStatus = 'loading' | 'ready' | 'error';

/** What the product modal shows, and the flows that change it. */
export class ProductDialogStore {
  view = $state<DialogView>({ kind: 'closed' });
  detailStatus = $state<DetailStatus>('ready');
  detailError = $state<ApiError | null>(null);

  #catalog: Pick<CatalogStore, 'update'>;
  #inFlight: AbortController | undefined;

  constructor(catalog: Pick<CatalogStore, 'update'>) {
    this.#catalog = catalog;
  }

  openCreate(): void {
    this.#cancelDetailFetch();
    this.view = { kind: 'create' };
  }

  close(): void {
    this.#cancelDetailFetch();
    this.view = { kind: 'closed' };
  }

  /** Shows the row's data at once, then replaces it with the server's copy of the record. */
  async openDetail(product: Product): Promise<void> {
    this.#cancelDetailFetch();
    const request = new AbortController();
    this.#inFlight = request;

    this.view = { kind: 'detail', product };
    this.detailStatus = 'loading';
    this.detailError = null;

    try {
      const fresh = await api.get<Product>(`/products/${product.id}`, { signal: request.signal });
      if (request.signal.aborted) return;

      this.view = { kind: 'detail', product: fresh };
      this.detailStatus = 'ready';
    } catch (cause) {
      if (request.signal.aborted) return;

      this.detailError =
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
      this.detailStatus = 'error';
    }
  }

  /**
   * Creates the product. A refusal rejects with the `ApiError` so the form can map its `details`
   * onto fields. On success the list is reset to newest-first (so the new row is at the top) and
   * the modal shows the new product, unless it was closed in the meantime.
   */
  async create(input: CreateProductInput): Promise<void> {
    const product = await api.post<Product>('/products', input);
    await this.#catalog.update({ q: '', category: '', sort: '-createdAt' });

    if (this.view.kind !== 'create') return;
    this.view = { kind: 'detail', product };
    this.detailStatus = 'ready';
    this.detailError = null;
  }

  #cancelDetailFetch(): void {
    this.#inFlight?.abort();
    this.#inFlight = undefined;
  }
}

export const productDialog = new ProductDialogStore(catalog);
