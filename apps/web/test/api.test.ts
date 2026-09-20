import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/lib/api.js';

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (response instanceof Error) throw response;
    // A Response body can be read once; clone so a test may call the client repeatedly.
    return response.clone();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('unwraps data from a single-resource response', async () => {
    const fetchMock = mockFetch(json({ data: { id: 1, title: 'Anvil' } }));

    await expect(api.get('/products/1')).resolves.toEqual({ id: 1, title: 'Anvil' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/products/1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('keeps meta on collection responses', async () => {
    const body = {
      data: [{ id: 1 }],
      meta: { page: 1, pageSize: 30, total: 1, totalPages: 1 },
    };
    mockFetch(json(body));

    await expect(api.list('/products')).resolves.toEqual(body);
  });

  it('serialises the query and drops empty values', async () => {
    const fetchMock = mockFetch(json({ data: [], meta: {} }));

    await api.list('/products', { query: { page: 2, q: '', category: undefined, sort: '-price' } });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/products?page=2&sort=-price');
  });

  it('sends a JSON body on post and patch', async () => {
    const fetchMock = mockFetch(json({ data: { id: 1 } }, 201));

    await api.post('/products', { title: 'Anvil' });
    await api.patch('/products/1', { stock: 3 });

    const [post, patch] = fetchMock.mock.calls;
    expect(post?.[1]).toMatchObject({
      method: 'POST',
      body: '{"title":"Anvil"}',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(patch?.[1]).toMatchObject({ method: 'PATCH', body: '{"stock":3}' });
  });

  it('resolves a 204 delete without reading a body', async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));

    await expect(api.delete('/products/1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/products/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('rejects with the error envelope as a typed ApiError', async () => {
    const details = [{ path: 'price', message: 'must be >= 0' }];
    mockFetch(
      json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid product payload', details } },
        400,
      ),
    );

    const error = await api.post('/products', {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid product payload',
      details,
    });
  });

  it('maps a non-envelope error response to INTERNAL_ERROR', async () => {
    mockFetch(new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }));

    await expect(api.get('/products')).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL_ERROR',
      details: [],
    });
  });

  it('maps a failed request to NETWORK_ERROR', async () => {
    mockFetch(new TypeError('fetch failed'));

    await expect(api.get('/products')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('lets an abort through untouched', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    mockFetch(abort);

    await expect(api.get('/products')).rejects.toBe(abort);
  });
});
