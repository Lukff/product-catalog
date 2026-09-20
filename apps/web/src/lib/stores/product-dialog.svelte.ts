import type { CreateProductInput, Product } from '@catalog/shared';
import { api, ApiError } from '../api.js';
import { changedFields } from '../product-form.js';
import { catalog, type CatalogStore } from './catalog.svelte.js';
import { stats, type StatsStore } from './stats.svelte.js';

export type DialogView =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'detail'; product: Product }
  | { kind: 'edit'; product: Product }
  | { kind: 'delete'; product: Product };

export type DetailStatus = 'loading' | 'ready' | 'error';
export type DeleteStatus = 'idle' | 'pending' | 'error';

type CatalogActions = Pick<CatalogStore, 'update' | 'load' | 'reloadAfterDelete'>;
type StatsActions = Pick<StatsStore, 'load'>;

/** What the product modal shows, and the flows that change it. */
export class ProductDialogStore {
  view = $state<DialogView>({ kind: 'closed' });
  detailStatus = $state<DetailStatus>('ready');
  detailError = $state<ApiError | null>(null);
  deleteStatus = $state<DeleteStatus>('idle');
  deleteError = $state<ApiError | null>(null);

  #catalog: CatalogActions;
  #stats: StatsActions;
  #inFlight: AbortController | undefined;

  constructor(catalog: CatalogActions, stats: StatsActions) {
    this.#catalog = catalog;
    this.#stats = stats;
  }

  openCreate(): void {
    this.#cancelDetailFetch();
    this.view = { kind: 'create' };
  }

  close(): void {
    this.#cancelDetailFetch();
    this.view = { kind: 'closed' };
  }

  /** Editing starts from the server's copy, so wait until the detail refresh has landed. */
  openEdit(): void {
    if (this.view.kind !== 'detail' || this.detailStatus === 'loading') return;
    this.view = { kind: 'edit', product: this.view.product };
  }

  openDelete(): void {
    if (this.view.kind !== 'detail' || this.detailStatus === 'loading') return;
    this.deleteStatus = 'idle';
    this.deleteError = null;
    this.view = { kind: 'delete', product: this.view.product };
  }

  backToDetail(): void {
    if (this.view.kind !== 'edit' && this.view.kind !== 'delete') return;
    this.view = { kind: 'detail', product: this.view.product };
  }

  /**
   * Saves the edit, sending only the fields that changed. A refusal rejects with the `ApiError`
   * so the form can map its `details` onto fields. On success the list is reloaded and the modal
   * shows the updated product, unless it was closed or moved to another product in the meantime.
   */
  async update(input: CreateProductInput): Promise<void> {
    const current = this.view;
    if (current.kind !== 'edit') return;

    const patch = changedFields(current.product, input);
    let product = current.product;
    if (Object.keys(patch).length > 0) {
      product = await api.patch<Product>(`/products/${product.id}`, patch);
      await Promise.all([this.#catalog.load(), this.#stats.load()]);
    }

    if (this.view.kind !== 'edit' || this.view.product.id !== product.id) return;
    this.view = { kind: 'detail', product };
    this.detailStatus = 'ready';
    this.detailError = null;
  }

  /** Deletes the product shown in the confirmation view. A failure is recorded, not thrown. */
  async remove(): Promise<void> {
    const current = this.view;
    if (current.kind !== 'delete' || this.deleteStatus === 'pending') return;

    this.deleteStatus = 'pending';
    this.deleteError = null;
    try {
      await api.delete(`/products/${current.product.id}`);
    } catch (cause) {
      this.deleteError =
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
      this.deleteStatus = 'error';
      return;
    }

    this.deleteStatus = 'idle';
    if (this.view.kind === 'delete' && this.view.product.id === current.product.id) this.close();
    await Promise.all([this.#catalog.reloadAfterDelete(), this.#stats.load()]);
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
    await Promise.all([
      this.#catalog.update({ q: '', category: '', stockStatus: '', sort: '-createdAt' }),
      this.#stats.load(),
    ]);

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

export const productDialog = new ProductDialogStore(catalog, stats);
