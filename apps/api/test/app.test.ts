import { createProductSchema, type ErrorResponse } from '@catalog/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { ConflictError, NotFoundError, ValidationError } from '../src/errors.js';
import { createTestDb, type TestDb } from './helpers.js';

let testDb: TestDb;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  testDb = createTestDb();
  app = createApp({ db: testDb.db });

  // Throwaway routes that raise each kind of error, so the handler is
  // exercised through real requests before any product route exists.
  app.get('/__test/not-found', () => {
    throw new NotFoundError('Product 7 not found');
  });
  app.get('/__test/conflict', () => {
    throw new ConflictError('sku already exists', [{ path: 'sku', message: 'already exists' }]);
  });
  app.get('/__test/conflict-plain', () => {
    throw new ConflictError('sku already exists');
  });
  app.get('/__test/validation', () => {
    throw new ValidationError('Invalid product payload', [
      { path: 'price', message: 'must be >= 0' },
    ]);
  });
  app.get('/__test/zod', () => {
    createProductSchema.parse({ title: 'x', price: -1 });
    return new Response('unreachable');
  });
  app.get('/__test/unexpected', () => {
    throw new Error('SQLITE: no such table /var/secret/catalog.db');
  });
});

afterAll(() => testDb.cleanup());
afterEach(() => vi.restoreAllMocks());

async function errorBody(res: Response): Promise<ErrorResponse> {
  return (await res.json()) as ErrorResponse;
}

describe('unknown routes', () => {
  it('return 404 NOT_FOUND in the error envelope, not the framework default', async () => {
    const res = await app.request('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await errorBody(res)).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  it('apply to every method', async () => {
    const res = await app.request('/api/does-not-exist', { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect((await errorBody(res)).error.code).toBe('NOT_FOUND');
  });
});

describe('error handler', () => {
  it('maps NotFoundError to 404 NOT_FOUND', async () => {
    const res = await app.request('/__test/not-found');

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await errorBody(res)).toEqual({
      error: { code: 'NOT_FOUND', message: 'Product 7 not found' },
    });
  });

  it('maps ConflictError to 409 CONFLICT and carries its details', async () => {
    const res = await app.request('/__test/conflict');

    expect(res.status).toBe(409);
    expect(await errorBody(res)).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'sku already exists',
        details: [{ path: 'sku', message: 'already exists' }],
      },
    });
  });

  it('omits details when a ConflictError has none', async () => {
    const res = await app.request('/__test/conflict-plain');

    expect(res.status).toBe(409);
    expect((await errorBody(res)).error).not.toHaveProperty('details');
  });

  it('maps ValidationError to 400 VALIDATION_ERROR with its details', async () => {
    const res = await app.request('/__test/validation');

    expect(res.status).toBe(400);
    expect(await errorBody(res)).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid product payload',
        details: [{ path: 'price', message: 'must be >= 0' }],
      },
    });
  });

  it('maps a thrown ZodError to 400 VALIDATION_ERROR listing every failing field', async () => {
    const res = await app.request('/__test/zod');
    const { error } = await errorBody(res);

    expect(res.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid request');

    const paths = error.details?.map((detail) => detail.path) ?? [];
    expect(paths).toContain('price');
    expect(paths).toContain('sku');
    expect(error.details).toContainEqual({ path: 'price', message: 'must be >= 0' });
  });

  it('maps an unexpected error to a generic 500 that leaks nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await app.request('/__test/unexpected');
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(text).not.toContain('SQLITE');
    expect(text).not.toContain('secret');
  });

  it('logs the real error server-side when it returns a 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await app.request('/__test/unexpected');

    expect(log).toHaveBeenCalledOnce();
    const logged = log.mock.calls[0]?.join(' ') ?? '';
    expect(logged).toContain('no such table');
  });

  it('does not log handled domain errors as failures', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await app.request('/__test/not-found');
    await app.request('/__test/validation');
    await app.request('/__test/conflict');

    expect(log).not.toHaveBeenCalled();
  });
});
