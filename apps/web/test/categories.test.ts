import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS } from '../src/lib/query-params.js';
import { CategoriesStore } from '../src/lib/stores/categories.svelte.js';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const page = (slugs: string[]) => ({
  data: slugs.map((slug) => ({ slug })),
  meta: { page: 1, pageSize: 100, total: slugs.length, totalPages: 1 },
});

const error = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

function setup(activeCategory = '') {
  const catalog = {
    params: { ...DEFAULT_PARAMS, category: activeCategory },
    update: vi.fn(async () => {}),
  };
  return { catalog, store: new CategoriesStore(catalog) };
}

function stubFetch(...replies: Response[]) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift()!);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('CategoriesStore', () => {
  describe('load', () => {
    it('fetches the first 100 categories and becomes ready', async () => {
      const fetchMock = stubFetch(json(page(['automotive', 'kitchen'])));
      const { store } = setup();

      expect(store.status).toBe('loading');
      await store.load();

      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/categories?pageSize=100');
      expect(store.slugs).toEqual(['automotive', 'kitchen']);
      expect(store.status).toBe('ready');
    });

    it('records an error status when the request fails', async () => {
      stubFetch(error('INTERNAL_ERROR', 'Internal server error', 500));
      const { store } = setup();

      await store.load();

      expect(store.status).toBe('error');
      expect(store.slugs).toEqual([]);
    });
  });

  describe('manager', () => {
    it('opens and closes, and clears an earlier error on open', async () => {
      stubFetch(error('CONFLICT', 'A category "tools" already exists', 409));
      const { store } = setup();
      await store.add('tools');
      expect(store.actionError).not.toBeNull();

      store.openManager();
      expect(store.managerOpen).toBe(true);
      expect(store.actionError).toBeNull();

      store.closeManager();
      expect(store.managerOpen).toBe(false);
    });
  });

  describe('add', () => {
    it('posts the trimmed slug and keeps the list sorted', async () => {
      const fetchMock = stubFetch(
        json(page(['automotive', 'kitchen'])),
        json({ data: { slug: 'garden' } }, 201),
      );
      const { store } = setup();
      await store.load();

      const added = await store.add('  garden ');

      expect(added).toBe(true);
      expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/categories');
      expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
      expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ slug: 'garden' });
      expect(store.slugs).toEqual(['automotive', 'garden', 'kitchen']);
      expect(store.actionError).toBeNull();
      expect(store.pending).toBe(false);
    });

    it('rejects an invalid slug without calling the server', async () => {
      const fetchMock = stubFetch();
      const { store } = setup();

      const added = await store.add('Home Decor');

      expect(added).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(store.actionError).toMatch(/lowercase slug/);
    });

    it('shows the server message and adds nothing when the slug is taken', async () => {
      stubFetch(
        json(page(['kitchen'])),
        error('CONFLICT', 'A category "kitchen" already exists', 409),
      );
      const { store } = setup();
      await store.load();

      const added = await store.add('kitchen');

      expect(added).toBe(false);
      expect(store.actionError).toBe('A category "kitchen" already exists');
      expect(store.slugs).toEqual(['kitchen']);
      expect(store.pending).toBe(false);
    });

    it('ignores a second add while one is in flight', async () => {
      const fetchMock = stubFetch(json({ data: { slug: 'garden' } }, 201));
      const { store } = setup();

      const first = store.add('garden');
      const second = await store.add('garden');
      await first;

      expect(second).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('deletes the category and drops it from the list', async () => {
      const fetchMock = stubFetch(
        json(page(['automotive', 'kitchen'])),
        new Response(null, { status: 204 }),
      );
      const { store, catalog } = setup();
      await store.load();

      await store.remove('kitchen');

      expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/categories/kitchen');
      expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
      expect(store.slugs).toEqual(['automotive']);
      expect(store.actionError).toBeNull();
      expect(catalog.update).not.toHaveBeenCalled();
    });

    it('resets the catalog filter when the removed category was the active one', async () => {
      stubFetch(json(page(['kitchen'])), new Response(null, { status: 204 }));
      const { store, catalog } = setup('kitchen');
      await store.load();

      await store.remove('kitchen');

      expect(catalog.update).toHaveBeenCalledWith({ category: '' });
    });

    it('shows the server message and keeps the category when it is still in use', async () => {
      stubFetch(
        json(page(['kitchen'])),
        error('CONFLICT', 'Category "kitchen" still has products', 409),
      );
      const { store, catalog } = setup('kitchen');
      await store.load();

      await store.remove('kitchen');

      expect(store.actionError).toBe('Category "kitchen" still has products');
      expect(store.slugs).toEqual(['kitchen']);
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

      await store.remove('kitchen');

      expect(store.actionError).toBe('Could not reach the server');
    });
  });
});
