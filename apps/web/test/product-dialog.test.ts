// apps/web/test/product-dialog.test.ts
import type { ItemResponse, Product } from '@catalog/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api.js';
import { ProductDialogStore } from '../src/lib/stores/product-dialog.svelte.js';

function product(id: number, overrides: Partial<Product> = {}): Product {
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
    ...overrides,
  };
}

const item = (data: Product): ItemResponse<Product> => ({ data });

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

const newInput = {
  title: 'Rocket Skates',
  description: 'Blast off.',
  category: 'gadgets',
  price: 19.99,
  stock: 3,
  brand: 'ACME',
  sku: 'ACM-1',
  weight: 2.5,
};

function setup() {
  const catalog = { update: vi.fn(async () => {}) };
  return { catalog, store: new ProductDialogStore(catalog) };
}

afterEach(() => vi.unstubAllGlobals());

describe('ProductDialogStore', () => {
  it('starts closed', () => {
    expect(setup().store.view).toEqual({ kind: 'closed' });
  });

  it('opens the create form and closes it', () => {
    const { store } = setup();

    store.openCreate();
    expect(store.view).toEqual({ kind: 'create' });
    store.close();
    expect(store.view).toEqual({ kind: 'closed' });
  });

  it('shows the row at once, then swaps in the server copy', async () => {
    const reply = deferred<Response>();
    const fetchMock = vi.fn((_url: string) => reply.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { store } = setup();
    const row = product(5, { stock: 10 });

    const opening = store.openDetail(row);
    expect(store.view).toEqual({ kind: 'detail', product: row });
    expect(store.detailStatus).toBe('loading');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products/5');

    reply.resolve(json(item(product(5, { stock: 4 }))));
    await opening;

    expect(store.view).toEqual({ kind: 'detail', product: product(5, { stock: 4 }) });
    expect(store.detailStatus).toBe('ready');
    expect(store.detailError).toBeNull();
  });

  it('keeps showing the row and records the error when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ error: { code: 'NOT_FOUND', message: 'Product 5 not found' } }, 404),
      ),
    );
    const { store } = setup();
    const row = product(5);

    await store.openDetail(row);

    expect(store.view).toEqual({ kind: 'detail', product: row });
    expect(store.detailStatus).toBe('error');
    expect(store.detailError?.code).toBe('NOT_FOUND');
  });

  it('ignores the response of a superseded detail fetch', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    );
    const { store } = setup();

    const openingA = store.openDetail(product(1));
    const openingB = store.openDetail(product(2));
    second.resolve(json(item(product(2, { title: 'B fresh' }))));
    await openingB;
    first.resolve(json(item(product(1, { title: 'A stale' }))));
    await openingA;

    expect(store.view).toEqual({ kind: 'detail', product: product(2, { title: 'B fresh' }) });
  });

  it('aborts an in-flight detail fetch when closed', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      }),
    );
    const { store } = setup();

    void store.openDetail(product(1));
    store.close();

    expect(signal?.aborted).toBe(true);
    expect(store.view).toEqual({ kind: 'closed' });
  });

  describe('create', () => {
    it('posts, refreshes the list newest-first, and shows the new product', async () => {
      const created = product(37, { title: 'Rocket Skates' });
      const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
        json(item(created), 201),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { store, catalog } = setup();
      store.openCreate();

      await store.create(newInput);

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('/api/products');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual(newInput);
      expect(catalog.update).toHaveBeenCalledWith({ q: '', category: '', sort: '-createdAt' });
      expect(store.view).toEqual({ kind: 'detail', product: created });
      expect(store.detailStatus).toBe('ready');
    });

    it('rejects with the ApiError and leaves the form open when the server refuses', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          json(
            {
              error: {
                code: 'CONFLICT',
                message: 'A product with SKU "ACM-1" already exists',
                details: [{ path: 'sku', message: 'is already in use' }],
              },
            },
            409,
          ),
        ),
      );
      const { store, catalog } = setup();
      store.openCreate();

      const failure = await store.create(newInput).catch((cause: unknown) => cause);

      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).details).toEqual([
        { path: 'sku', message: 'is already in use' },
      ]);
      expect(store.view).toEqual({ kind: 'create' });
      expect(catalog.update).not.toHaveBeenCalled();
    });

    it('does not reopen the modal if it was closed while the request was in flight', async () => {
      const reply = deferred<Response>();
      vi.stubGlobal(
        'fetch',
        vi.fn(() => reply.promise),
      );
      const { store } = setup();
      store.openCreate();

      const creating = store.create(newInput);
      store.close();
      reply.resolve(json(item(product(37)), 201));
      await creating;

      expect(store.view).toEqual({ kind: 'closed' });
    });
  });
});
