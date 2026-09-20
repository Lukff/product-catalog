import SwaggerParser from '@apidevtools/swagger-parser';
import {
  ERROR_CODES,
  categorySchema,
  createCategorySchema,
  createProductSchema,
  patchProductSchema,
  productSchema,
} from '@catalog/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createTestDb, type TestDb } from './helpers.js';

type Schema = Record<string, unknown>;

interface Operation {
  summary: string;
  description: string;
  tags?: string[];
  parameters?: { name: string; in: string; required?: boolean; schema: Schema }[];
  requestBody?: { content: Record<string, { schema: Schema; example?: unknown }> };
  responses: Record<
    string,
    { description: string; content?: Record<string, { schema: Schema; example?: unknown }> }
  >;
  'x-implemented': boolean;
}

interface Doc {
  openapi: string;
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema & { properties?: Record<string, Schema> }> };
}

const EXPECTED_OPERATIONS = [
  'DELETE /api/products/{id}',
  'GET /api/categories',
  'GET /api/products',
  'GET /api/products/{id}',
  'PATCH /api/products/{id}',
  'POST /api/categories',
  'POST /api/products',
];

const EXPECTED_STATUSES: Record<string, string[]> = {
  'GET /api/products': ['200', '400', '500'],
  'POST /api/products': ['201', '400', '409', '500'],
  'GET /api/products/{id}': ['200', '400', '404', '500'],
  'PATCH /api/products/{id}': ['200', '400', '404', '409', '500'],
  'DELETE /api/products/{id}': ['204', '400', '404', '500'],
  'GET /api/categories': ['200', '400', '500'],
  'POST /api/categories': ['201', '400', '409', '500'],
};

/** Operations whose route exists in the real app. Add each one here as its backlog item lands. */
const IMPLEMENTED_OPERATIONS = new Set([
  'GET /api/products',
  'GET /api/products/{id}',
  'POST /api/products',
  'PATCH /api/products/{id}',
  'DELETE /api/products/{id}',
]);

let testDb: TestDb;

beforeAll(() => {
  testDb = createTestDb();
});
afterAll(() => testDb.cleanup());

const newApp = () => createApp({ db: testDb.db });

async function fetchDoc(app: ReturnType<typeof createApp>): Promise<Doc> {
  const res = await app.request('/api/openapi.json');
  expect(res.status).toBe(200);
  return (await res.json()) as Doc;
}

function operations(doc: Doc): Map<string, Operation> {
  const found = new Map<string, Operation>();
  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      found.set(`${method.toUpperCase()} ${path}`, operation);
    }
  }
  return found;
}

/** Registered `METHOD /path/{param}` routes (ignoring middleware) that the document does not describe. */
function undocumentedRoutes(app: ReturnType<typeof createApp>, doc: Doc): string[] {
  const documented = new Set(operations(doc).keys());
  return app.routes
    .filter((route) => route.method !== 'ALL')
    .filter((route) => route.path !== '/api/openapi.json' && route.path !== '/api/docs')
    .map((route) => `${route.method} ${route.path.replace(/:(\w+)/g, '{$1}')}`)
    .filter((key) => !documented.has(key));
}

describe('GET /api/openapi.json', () => {
  it('serves an OpenAPI 3.1 document as JSON', async () => {
    const app = newApp();
    const res = await app.request('/api/openapi.json');
    const doc = (await res.json()) as Doc;

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info).toMatchObject({ title: 'Product Catalog API', version: '0.1.0' });
  });

  it('is a valid OpenAPI document', async () => {
    const doc = await fetchDoc(newApp());

    await expect(SwaggerParser.validate(structuredClone(doc))).resolves.toBeDefined();
  });

  it('documents exactly the operations in the API contract', async () => {
    const doc = await fetchDoc(newApp());

    expect([...operations(doc).keys()].sort()).toEqual(EXPECTED_OPERATIONS);
  });

  it('answers each operation with the documented status codes', async () => {
    const doc = await fetchDoc(newApp());

    for (const [key, operation] of operations(doc)) {
      expect(Object.keys(operation.responses).sort(), key).toEqual(EXPECTED_STATUSES[key]);
    }
  });

  it('points every error response at the shared error shape', async () => {
    const doc = await fetchDoc(newApp());

    for (const [key, operation] of operations(doc)) {
      for (const [status, response] of Object.entries(operation.responses)) {
        if (Number(status) < 400) continue;
        expect(response.content?.['application/json']?.schema, `${key} ${status}`).toEqual({
          $ref: '#/components/schemas/Error',
        });
      }
    }
  });

  it('gives the error schema the shared error codes', async () => {
    const doc = await fetchDoc(newApp());
    const error = doc.components.schemas.Error?.properties?.error as {
      properties: { code: { enum: string[] }; details: { items: Schema } };
    };

    expect(error.properties.code.enum).toEqual([...ERROR_CODES]);
    expect(error.properties.details.items).toMatchObject({
      properties: { path: { type: 'string' }, message: { type: 'string' } },
    });
  });

  it('sends no body on a 204 and no request body on reads', async () => {
    const doc = await fetchDoc(newApp());
    const ops = operations(doc);

    expect(ops.get('DELETE /api/products/{id}')?.responses['204']?.content).toBeUndefined();
    expect(ops.get('GET /api/products')?.requestBody).toBeUndefined();
    expect(ops.get('GET /api/products/{id}')?.requestBody).toBeUndefined();
  });
});

describe('component schemas', () => {
  it('builds the product schemas from the shared ones', async () => {
    const { schemas } = (await fetchDoc(newApp())).components;

    const create = schemas.CreateProduct as {
      properties: Record<string, Schema>;
      required: string[];
    };
    expect(Object.keys(create.properties).sort()).toEqual(
      Object.keys(createProductSchema.shape).sort(),
    );
    expect(create.required.sort()).toEqual(Object.keys(createProductSchema.shape).sort());
    expect(create.properties.price).toMatchObject({ type: 'number', minimum: 0 });
    expect(create.properties.weight).toMatchObject({ type: 'number', exclusiveMinimum: 0 });
    expect(create.properties.category).toMatchObject({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' });

    const product = schemas.Product as { properties: Record<string, Schema>; required: string[] };
    expect(Object.keys(product.properties)).toEqual(expect.arrayContaining(['id', 'meta', 'sku']));
    expect(product.required).toEqual(expect.arrayContaining(['id', 'meta']));
  });

  it('describes a patch as any subset of the create fields', async () => {
    const { schemas } = (await fetchDoc(newApp())).components;
    const patch = schemas.PatchProduct as {
      properties: Record<string, Schema>;
      required?: string[];
    };

    expect(Object.keys(patch.properties).sort()).toEqual(
      Object.keys(createProductSchema.shape).sort(),
    );
    expect(patch.required ?? []).toEqual([]);
  });

  it('describes a category as a slug and nothing else', async () => {
    const { schemas } = (await fetchDoc(newApp())).components;

    expect(Object.keys((schemas.Category as { properties: Schema }).properties)).toEqual(['slug']);
    expect(Object.keys((schemas.CreateCategory as { properties: Schema }).properties)).toEqual([
      'slug',
    ]);
  });

  it('wraps items and lists in the response envelope', async () => {
    const { schemas } = (await fetchDoc(newApp())).components;

    expect(schemas.ProductResponse).toMatchObject({
      properties: { data: { $ref: '#/components/schemas/Product' } },
      required: ['data'],
    });
    expect(schemas.ProductList).toMatchObject({
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/Product' } },
        meta: { $ref: '#/components/schemas/PageMeta' },
      },
      required: ['data', 'meta'],
    });
    expect(schemas.PageMeta).toMatchObject({
      required: ['page', 'pageSize', 'total', 'totalPages'],
    });
  });

  it('is free of generator noise', async () => {
    const doc = await fetchDoc(newApp());
    const json = JSON.stringify(doc);
    const createdAt = (
      doc.components.schemas.Product?.properties?.meta as {
        properties: Record<string, Schema>;
      }
    ).properties.createdAt;

    expect(json).not.toContain('"$schema"');
    expect(json).not.toContain('9007199254740991');
    expect(createdAt).toMatchObject({ type: 'string', format: 'date-time' });
    expect(createdAt).not.toHaveProperty('pattern');
  });
});

describe('operations', () => {
  it('describes the list query parameters from the shared query schema', async () => {
    const doc = await fetchDoc(newApp());
    const params = operations(doc).get('GET /api/products')?.parameters ?? [];
    const byName = Object.fromEntries(params.map((param) => [param.name, param]));

    expect(Object.keys(byName).sort()).toEqual(['category', 'page', 'pageSize', 'q', 'sort']);
    expect(params.every((param) => param.in === 'query' && !param.required)).toBe(true);
    expect(byName.pageSize?.schema).toMatchObject({ default: 30, minimum: 1, maximum: 100 });
    expect(byName.page?.schema).toMatchObject({ default: 1, minimum: 1 });
    expect(byName.sort?.schema.enum).toEqual(
      expect.arrayContaining(['-price', 'stock', 'updatedAt']),
    );
    expect(byName.category?.schema).toMatchObject({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' });
  });

  it('paginates the category list the same way', async () => {
    const doc = await fetchDoc(newApp());
    const params = operations(doc).get('GET /api/categories')?.parameters ?? [];

    expect(params.map((param) => param.name).sort()).toEqual(['page', 'pageSize']);
  });

  it('takes the product id as a positive integer path parameter', async () => {
    const doc = await fetchDoc(newApp());

    for (const key of ['GET', 'PATCH', 'DELETE'].map((method) => `${method} /api/products/{id}`)) {
      expect(operations(doc).get(key)?.parameters, key).toEqual([
        expect.objectContaining({
          name: 'id',
          in: 'path',
          required: true,
          schema: expect.objectContaining({ type: 'integer', minimum: 1 }),
        }),
      ]);
    }
  });

  it('takes JSON bodies that reference the shared schemas', async () => {
    const doc = await fetchDoc(newApp());
    const ops = operations(doc);
    const body = (key: string) => ops.get(key)?.requestBody?.content['application/json'];

    expect(body('POST /api/products')?.schema).toEqual({
      $ref: '#/components/schemas/CreateProduct',
    });
    expect(body('PATCH /api/products/{id}')?.schema).toEqual({
      $ref: '#/components/schemas/PatchProduct',
    });
    expect(body('POST /api/categories')?.schema).toEqual({
      $ref: '#/components/schemas/CreateCategory',
    });
  });

  it('pre-fills request bodies with examples that pass the shared schemas', async () => {
    const doc = await fetchDoc(newApp());
    const ops = operations(doc);
    const example = (key: string) =>
      ops.get(key)?.requestBody?.content['application/json']?.example;

    expect(createProductSchema.safeParse(example('POST /api/products')).success).toBe(true);
    expect(patchProductSchema.safeParse(example('PATCH /api/products/{id}')).success).toBe(true);
    expect(createCategorySchema.safeParse(example('POST /api/categories')).success).toBe(true);
  });

  it('returns the documented success shapes', async () => {
    const doc = await fetchDoc(newApp());
    const ops = operations(doc);
    const success = (key: string, status: string) =>
      ops.get(key)?.responses[status]?.content?.['application/json']?.schema;

    expect(success('GET /api/products', '200')).toEqual({
      $ref: '#/components/schemas/ProductList',
    });
    expect(success('POST /api/products', '201')).toEqual({
      $ref: '#/components/schemas/ProductResponse',
    });
    expect(success('GET /api/products/{id}', '200')).toEqual({
      $ref: '#/components/schemas/ProductResponse',
    });
    expect(success('PATCH /api/products/{id}', '200')).toEqual({
      $ref: '#/components/schemas/ProductResponse',
    });
    expect(success('GET /api/categories', '200')).toEqual({
      $ref: '#/components/schemas/CategoryList',
    });
    expect(success('POST /api/categories', '201')).toEqual({
      $ref: '#/components/schemas/CategoryResponse',
    });
  });

  it('groups operations under Products and Categories', async () => {
    const doc = await fetchDoc(newApp());

    for (const [key, operation] of operations(doc)) {
      expect(operation.tags, key).toEqual([
        key.includes('/categories') ? 'Categories' : 'Products',
      ]);
    }
  });
});

describe('response examples', () => {
  const exampleOf = (operation: Operation | undefined, status: string) =>
    operation?.responses[status]?.content?.['application/json']?.example as
      Record<string, unknown> | undefined;

  it('shows each error status with its own error code, not one generic example', async () => {
    const doc = await fetchDoc(newApp());
    const codeForStatus: Record<string, string> = {
      '400': 'VALIDATION_ERROR',
      '404': 'NOT_FOUND',
      '409': 'CONFLICT',
      '500': 'INTERNAL_ERROR',
    };

    for (const [key, operation] of operations(doc)) {
      for (const [status, code] of Object.entries(codeForStatus)) {
        if (!(status in operation.responses)) continue;
        expect(exampleOf(operation, status), `${key} ${status}`).toMatchObject({
          error: { code, message: expect.any(String) },
        });
      }
    }
  });

  it('lists the failing fields in the validation and conflict examples', async () => {
    const ops = operations(await fetchDoc(newApp()));

    expect(exampleOf(ops.get('POST /api/products'), '400')).toMatchObject({
      error: { details: [{ path: 'price', message: 'must be >= 0' }] },
    });
    expect(exampleOf(ops.get('POST /api/products'), '409')).toMatchObject({
      error: { details: [{ path: 'sku', message: expect.any(String) }] },
    });
  });

  it('shows product examples that pass the shared product schema', async () => {
    const ops = operations(await fetchDoc(newApp()));

    for (const [key, status] of [
      ['POST /api/products', '201'],
      ['GET /api/products/{id}', '200'],
      ['PATCH /api/products/{id}', '200'],
    ] as const) {
      const example = exampleOf(ops.get(key), status);
      expect(productSchema.safeParse(example?.data).success, key).toBe(true);
    }

    const page = exampleOf(ops.get('GET /api/products'), '200') as {
      data: unknown[];
      meta: Record<string, number>;
    };
    expect(page.data.length).toBeGreaterThan(0);
    for (const product of page.data) expect(productSchema.safeParse(product).success).toBe(true);
    expect(Object.keys(page.meta).sort()).toEqual(['page', 'pageSize', 'total', 'totalPages']);
    expect(page.meta.total).toBe(page.data.length);
  });

  it('shows category examples that pass the shared category schema', async () => {
    const ops = operations(await fetchDoc(newApp()));

    const created = exampleOf(ops.get('POST /api/categories'), '201');
    expect(categorySchema.safeParse(created?.data).success).toBe(true);

    const page = exampleOf(ops.get('GET /api/categories'), '200') as { data: unknown[] };
    expect(page.data.length).toBeGreaterThan(0);
    for (const category of page.data) expect(categorySchema.safeParse(category).success).toBe(true);
  });
});

describe('implementation status', () => {
  it('marks an operation as not implemented until its route exists', async () => {
    const doc = await fetchDoc(newApp());

    for (const [key, operation] of operations(doc)) {
      const implemented = IMPLEMENTED_OPERATIONS.has(key);
      expect(operation['x-implemented'], key).toBe(implemented);
      if (implemented) {
        expect(operation.description, key).not.toMatch(/Not implemented yet/);
      } else {
        expect(operation.description, key).toMatch(/^\*\*Not implemented yet\.\*\*/);
      }
    }
  });

  it('flips an operation on as soon as its route is registered, and only that one', async () => {
    const app = newApp();
    app.get('/api/categories', (c) => c.json({ data: [] }));

    const ops = operations(await fetchDoc(app));

    expect(ops.get('GET /api/categories')?.['x-implemented']).toBe(true);
    expect(ops.get('GET /api/categories')?.description).not.toMatch(/Not implemented yet/);
    expect(ops.get('POST /api/categories')?.['x-implemented']).toBe(false);
  });
});

describe('documentation coverage', () => {
  it('describes every route the real app registers', async () => {
    const app = newApp();

    expect(undocumentedRoutes(app, await fetchDoc(app))).toEqual([]);
  });

  it('would catch a route that is missing from the document', async () => {
    const app = newApp();
    app.get('/api/widgets/:id', (c) => c.json({}));
    app.post('/api/products', (c) => c.json({}, 201));

    expect(undocumentedRoutes(app, await fetchDoc(app))).toEqual(['GET /api/widgets/{id}']);
  });
});

describe('GET /api/docs', () => {
  it('serves Swagger UI pointed at the OpenAPI document', async () => {
    const res = await newApp().request('/api/docs');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('swagger-ui');
    expect(html).toContain('/api/openapi.json');
  });
});
