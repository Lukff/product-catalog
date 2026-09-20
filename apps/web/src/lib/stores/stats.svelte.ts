import type { ProductStats } from '@catalog/shared';
import { api } from '../api.js';

export type StatsStatus = 'loading' | 'ready' | 'error';

/** The catalog-wide numbers behind the metric strip. */
export class StatsStore {
  stats = $state<ProductStats | null>(null);
  status = $state<StatsStatus>('loading');

  #latest = 0;

  /**
   * Fetches the numbers. The last good ones stay on screen while a refresh runs or after it fails,
   * and a response that a newer call has superseded is dropped. A failure is recorded, not thrown:
   * the strip is secondary to the list, so it must never break the page.
   */
  async load(): Promise<void> {
    const call = ++this.#latest;
    this.status = 'loading';

    try {
      const stats = await api.get<ProductStats>('/products/stats');
      if (call !== this.#latest) return;

      this.stats = stats;
      this.status = 'ready';
    } catch {
      if (call !== this.#latest) return;
      this.status = 'error';
    }
  }
}

export const stats = new StatsStore();
