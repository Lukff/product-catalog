import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineAdd } from '../src/lib/inline-add.svelte.js';
import { BrandsStore } from '../src/lib/stores/brands.svelte.js';
import { CategoriesStore } from '../src/lib/stores/categories.svelte.js';
import { DEFAULT_PARAMS } from '../src/lib/query-params.js';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(...replies: Response[]) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => replies.shift()!);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const catalog = () => ({ params: { ...DEFAULT_PARAMS }, update: vi.fn(async () => {}) });

afterEach(() => vi.unstubAllGlobals());

describe('InlineAdd with the categories store', () => {
  function setup() {
    const store = new CategoriesStore(catalog());
    store.slugs = ['automotive', 'kitchen'];
    return { store, inline: new InlineAdd(store, () => store.slugs) };
  }

  it('creates the category, adds it to the shared list and hands it back to select', async () => {
    const fetchMock = stubFetch(json({ data: { slug: 'garden' } }, 201));
    const { store, inline } = setup();

    inline.open();
    expect(inline.adding).toBe(true);
    inline.draft = '  garden ';
    const selected = await inline.confirm();

    expect(selected).toBe('garden');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/categories');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ slug: 'garden' });
    expect(store.slugs).toEqual(['automotive', 'garden', 'kitchen']);
    expect(inline.adding).toBe(false);
    expect(inline.draft).toBe('');
    expect(inline.error).toBeNull();
    expect(inline.pending).toBe(false);
  });

  it('shows a client-side validation message inline and keeps the input open', async () => {
    const fetchMock = stubFetch();
    const { inline } = setup();

    inline.open();
    inline.draft = 'Home Decor';
    const selected = await inline.confirm();

    expect(selected).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inline.error).toMatch(/lowercase slug/);
    expect(inline.adding).toBe(true);
    expect(inline.draft).toBe('Home Decor');
  });

  it('shows the duplicate inline without calling the server, and offers the existing entry', async () => {
    const fetchMock = stubFetch();
    const { store, inline } = setup();

    inline.open();
    inline.draft = 'kitchen';
    const selected = await inline.confirm();

    expect(selected).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inline.error).toBe('"kitchen" already exists.');
    expect(inline.duplicate).toBe('kitchen');
    expect(store.slugs).toEqual(['automotive', 'kitchen']);

    expect(inline.useExisting()).toBe('kitchen');
    expect(inline.adding).toBe(false);
    expect(inline.duplicate).toBeNull();
  });

  it('shows the server message inline when the create is refused', async () => {
    stubFetch(
      json({ error: { code: 'CONFLICT', message: 'A category "garden" already exists' } }, 409),
    );
    const { store, inline } = setup();

    inline.open();
    inline.draft = 'garden';
    const selected = await inline.confirm();

    expect(selected).toBeNull();
    expect(inline.error).toBe('A category "garden" already exists');
    expect(inline.adding).toBe(true);
    expect(inline.pending).toBe(false);
    expect(store.slugs).toEqual(['automotive', 'kitchen']);
  });

  it('cancel closes the input and clears the draft and error without hitting the server', async () => {
    const fetchMock = stubFetch();
    const { inline } = setup();

    inline.open();
    inline.draft = 'Bad Slug';
    await inline.confirm();
    inline.cancel();

    expect(inline.adding).toBe(false);
    expect(inline.draft).toBe('');
    expect(inline.error).toBeNull();
    expect(inline.useExisting()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a second confirm while one is in flight', async () => {
    const fetchMock = stubFetch(json({ data: { slug: 'garden' } }, 201));
    const { inline } = setup();

    inline.open();
    inline.draft = 'garden';
    const first = inline.confirm();
    const second = await inline.confirm();
    await first;

    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reopens empty after an earlier error', async () => {
    const { inline } = setup();
    inline.open();
    inline.draft = 'kitchen';
    await inline.confirm();

    inline.open();

    expect(inline.draft).toBe('');
    expect(inline.error).toBeNull();
    expect(inline.duplicate).toBeNull();
  });
});

describe('InlineAdd with the brands store', () => {
  it('creates a brand with a space in its name and selects it', async () => {
    const fetchMock = stubFetch(json({ data: { name: 'Acme Corp' } }, 201));
    const store = new BrandsStore(catalog());
    store.names = ['ACME'];
    const inline = new InlineAdd(store, () => store.names);

    inline.open();
    inline.draft = 'Acme Corp';
    const selected = await inline.confirm();

    expect(selected).toBe('Acme Corp');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/brands');
    expect(store.names).toEqual(['ACME', 'Acme Corp']);
  });

  it('shows a duplicate brand inline', async () => {
    stubFetch();
    const store = new BrandsStore(catalog());
    store.names = ['ACME'];
    const inline = new InlineAdd(store, () => store.names);

    inline.open();
    inline.draft = 'ACME';

    expect(await inline.confirm()).toBeNull();
    expect(inline.error).toBe('"ACME" already exists.');
  });
});
