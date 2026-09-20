import type { ListResponse, Product } from '@catalog/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogStore } from '../src/lib/stores/catalog.svelte.js';

function product(id: number): Product {
  return {
    id,
    title: `Product ${id}`,
    description: 'A thing',
    category: 'gadgets',
    price: 9.99,
    stock: 10,
    brand: 'Acme',
    sku: `SKU-${id}`,
    weight: 1,
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  };
}

function page(products: Product[], total = products.length): ListResponse<Product> {
  return {
    data: products,
    meta: { page: 1, pageSize: 30, total, totalPages: Math.ceil(total / 30) },
  };
}

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

describe('CatalogStore', () => {
  it('starts in the loading state with no data', () => {
    const store = new CatalogStore();

    expect(store.status).toBe('loading');
    expect(store.products).toEqual([]);
    expect(store.meta).toBeNull();
    expect(store.error).toBeNull();
  });

  it('requests the first page at the default page size and stores the result', async () => {
    const fetchMock = vi.fn(async (_url: string) => json(page([product(1), product(2)], 36)));
    vi.stubGlobal('fetch', fetchMock);
    const store = new CatalogStore();

    const loading = store.load();
    expect(store.status).toBe('loading');
    await loading;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products?page=1&pageSize=30');
    expect(store.status).toBe('ready');
    expect(store.products.map((item) => item.id)).toEqual([1, 2]);
    expect(store.meta).toEqual({ page: 1, pageSize: 30, total: 36, totalPages: 2 });
    expect(store.error).toBeNull();
  });

  it('is ready with no products for an empty catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(page([], 0))),
    );
    const store = new CatalogStore();

    await store.load();

    expect(store.status).toBe('ready');
    expect(store.products).toEqual([]);
    expect(store.meta?.total).toBe(0);
  });

  it('surfaces the API error envelope as a typed error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500),
      ),
    );
    const store = new CatalogStore();

    await store.load();

    expect(store.status).toBe('error');
    expect(store.error?.code).toBe('INTERNAL_ERROR');
    expect(store.error?.status).toBe(500);
  });

  it('reports an unreachable server as NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const store = new CatalogStore();

    await store.load();

    expect(store.status).toBe('error');
    expect(store.error?.code).toBe('NETWORK_ERROR');
  });

  it('recovers on a retry and clears the error', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(page([product(1)])));
    vi.stubGlobal('fetch', fetchMock);
    const store = new CatalogStore();

    await store.load();
    expect(store.status).toBe('error');

    await store.load();
    expect(store.status).toBe('ready');
    expect(store.error).toBeNull();
    expect(store.products).toHaveLength(1);
  });

  it('ignores a response that a newer load has superseded', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    );
    const store = new CatalogStore();

    const older = store.load();
    const newer = store.load();
    second.resolve(json(page([product(2)])));
    await newer;
    first.resolve(json(page([product(1)])));
    await older;

    expect(store.status).toBe('ready');
    expect(store.products.map((item) => item.id)).toEqual([2]);
  });

  it('aborts the previous request when a new load starts', async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        signals.push(init?.signal);
        return json(page([product(1)]));
      }),
    );
    const store = new CatalogStore();

    const older = store.load();
    const newer = store.load();
    await Promise.all([older, newer]);

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });
});
