import type { ProductStats } from '@catalog/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatsStore } from '../src/lib/stores/stats.svelte.js';

const stats: ProductStats = {
  total: 36,
  inStock: 24,
  lowStock: 7,
  outOfStock: 5,
  inventoryValue: 18432.75,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => vi.unstubAllGlobals());

describe('StatsStore', () => {
  it('starts loading with no numbers', () => {
    const store = new StatsStore();

    expect(store.status).toBe('loading');
    expect(store.stats).toBeNull();
  });

  it('loads the stats from /products/stats', async () => {
    const fetchMock = vi.fn(async (_url: string) => json({ data: stats }));
    vi.stubGlobal('fetch', fetchMock);
    const store = new StatsStore();

    await store.load();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products/stats');
    expect(store.status).toBe('ready');
    expect(store.stats).toEqual(stats);
  });

  it('keeps the previous numbers on screen while a refresh is in flight', async () => {
    const next = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ data: stats }))
        .mockReturnValueOnce(next.promise),
    );
    const store = new StatsStore();
    await store.load();

    const refreshing = store.load();

    expect(store.stats).toEqual(stats);
    next.resolve(json({ data: { ...stats, total: 37, outOfStock: 6 } }));
    await refreshing;
    expect(store.stats?.total).toBe(37);
  });

  it('records a failure without throwing, and keeps the last good numbers', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ data: stats }))
        .mockRejectedValueOnce(new TypeError('Failed to fetch')),
    );
    const store = new StatsStore();
    await store.load();

    await expect(store.load()).resolves.toBeUndefined();

    expect(store.status).toBe('error');
    expect(store.stats).toEqual(stats);
  });

  it('recovers on the next successful load', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }, 500))
        .mockResolvedValueOnce(json({ data: stats })),
    );
    const store = new StatsStore();

    await store.load();
    expect(store.status).toBe('error');

    await store.load();
    expect(store.status).toBe('ready');
    expect(store.stats).toEqual(stats);
  });

  it('ignores a response that a newer load has superseded', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    );
    const store = new StatsStore();

    const older = store.load();
    const newer = store.load();
    second.resolve(json({ data: { ...stats, total: 40 } }));
    await newer;
    first.resolve(json({ data: { ...stats, total: 1 } }));
    await older;

    expect(store.stats?.total).toBe(40);
  });
});
