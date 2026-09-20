import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS } from '../src/lib/query-params.js';
import { BrandsStore } from '../src/lib/stores/brands.svelte.js';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const page = (names: string[]) => ({
  data: names.map((name) => ({ name })),
  meta: { page: 1, pageSize: 100, total: names.length, totalPages: 1 },
});

const error = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

function setup(activeBrand = '') {
  const catalog = {
    params: { ...DEFAULT_PARAMS, brand: activeBrand },
    update: vi.fn(async () => {}),
  };
  return { catalog, store: new BrandsStore(catalog) };
}

function stubFetch(...replies: Response[]) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift()!);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('BrandsStore', () => {
  describe('load', () => {
    it('fetches the first 100 brands and becomes ready', async () => {
      const fetchMock = stubFetch(json(page(['ACME', 'Globex'])));
      const { store } = setup();

      expect(store.status).toBe('loading');
      await store.load();

      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/brands?pageSize=100');
      expect(store.names).toEqual(['ACME', 'Globex']);
      expect(store.status).toBe('ready');
    });

    it('records an error status when the request fails', async () => {
      stubFetch(error('INTERNAL_ERROR', 'Internal server error', 500));
      const { store } = setup();

      await store.load();

      expect(store.status).toBe('error');
      expect(store.names).toEqual([]);
    });
  });

  describe('manager', () => {
    it('opens and closes, and clears an earlier error on open', async () => {
      stubFetch(error('CONFLICT', 'A brand "ACME" already exists', 409));
      const { store } = setup();
      await store.add('ACME');
      expect(store.actionError).not.toBeNull();

      store.openManager();
      expect(store.managerOpen).toBe(true);
      expect(store.actionError).toBeNull();

      store.closeManager();
      expect(store.managerOpen).toBe(false);
    });
  });

  describe('add', () => {
    it('posts the trimmed name and keeps the list sorted', async () => {
      const fetchMock = stubFetch(
        json(page(['ACME', 'Initech'])),
        json({ data: { name: 'Globex' } }, 201),
      );
      const { store } = setup();
      await store.load();

      const added = await store.add('  Globex ');

      expect(added).toBe(true);
      expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/brands');
      expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
      expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ name: 'Globex' });
      expect(store.names).toEqual(['ACME', 'Globex', 'Initech']);
      expect(store.actionError).toBeNull();
      expect(store.pending).toBe(false);
    });

    it('rejects a blank or slashed name without calling the server', async () => {
      const fetchMock = stubFetch();
      const { store } = setup();

      expect(await store.add('   ')).toBe(false);
      expect(store.actionError).toMatch(/^Name is required/);
      expect(await store.add('AC/DC')).toBe(false);
      expect(store.actionError).toMatch(/must not contain/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('shows the server message and adds nothing when the name is taken', async () => {
      stubFetch(json(page(['ACME'])), error('CONFLICT', 'A brand "ACME" already exists', 409));
      const { store } = setup();
      await store.load();

      const added = await store.add('ACME');

      expect(added).toBe(false);
      expect(store.actionError).toBe('A brand "ACME" already exists');
      expect(store.names).toEqual(['ACME']);
      expect(store.pending).toBe(false);
    });

    it('ignores a second add while one is in flight', async () => {
      const fetchMock = stubFetch(json({ data: { name: 'Globex' } }, 201));
      const { store } = setup();

      const first = store.add('Globex');
      const second = await store.add('Globex');
      await first;

      expect(second).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('deletes the brand by its URL-encoded name and drops it from the list', async () => {
      const fetchMock = stubFetch(
        json(page(['ACME', 'Acme Corp'])),
        new Response(null, { status: 204 }),
      );
      const { store, catalog } = setup();
      await store.load();

      await store.remove('Acme Corp');

      expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/brands/Acme%20Corp');
      expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
      expect(store.names).toEqual(['ACME']);
      expect(store.actionError).toBeNull();
      expect(catalog.update).not.toHaveBeenCalled();
    });

    it('resets the catalog filter when the removed brand was the active one', async () => {
      stubFetch(json(page(['ACME'])), new Response(null, { status: 204 }));
      const { store, catalog } = setup('ACME');
      await store.load();

      await store.remove('ACME');

      expect(catalog.update).toHaveBeenCalledWith({ brand: '' });
    });

    it('shows the server message and keeps the brand when it is still in use', async () => {
      stubFetch(json(page(['ACME'])), error('CONFLICT', 'Brand "ACME" still has products', 409));
      const { store, catalog } = setup('ACME');
      await store.load();

      await store.remove('ACME');

      expect(store.actionError).toBe('Brand "ACME" still has products');
      expect(store.names).toEqual(['ACME']);
      expect(catalog.update).not.toHaveBeenCalled();
      expect(store.pending).toBe(false);
    });

    it('reports a network failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('failed to fetch');
        }),
      );
      const { store } = setup();

      await store.remove('ACME');

      expect(store.actionError).toBe('Could not reach the server');
    });
  });
});
