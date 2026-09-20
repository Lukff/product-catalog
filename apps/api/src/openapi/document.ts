import {
  ERROR_CODES,
  LOW_STOCK_THRESHOLD,
  brandNameParamSchema,
  brandSchema,
  categorySchema,
  categorySlugParamSchema,
  createBrandSchema,
  createCategorySchema,
  createProductSchema,
  listQuerySchema,
  patchProductSchema,
  productSchema,
  productStatsSchema,
} from '@catalog/shared';
import { jsonSchema, type Schema } from './json-schema.js';

export const API_VERSION = '0.1.0';

const NOT_IMPLEMENTED = '**Not implemented yet.** ';

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (schema: Schema, example?: unknown) => ({
  'application/json': { schema, ...(example !== undefined && { example }) },
});

/** The brief's two sample products, as the API returns them. */
const PRODUCT_EXAMPLES = [
  {
    id: 1,
    title: 'Large Flux Capacitor',
    description:
      'The Large Flux Capacitor provides the maximum motive force for your inter-dimensional aluminum automobile.',
    category: 'automotive',
    price: 9.99,
    stock: 42,
    brand: 'ACME',
    sku: 'ACM-FC-001',
    weight: 4,
    meta: { createdAt: '2025-04-30T09:41:02.053Z', updatedAt: '2025-04-30T09:41:02.053Z' },
  },
  {
    id: 2,
    title: 'Medium Flux Capacitor',
    description:
      "The Medium Flux Capacitor is a great budget option if you don't need to travel far in your inter-dimensional aluminum automobile.",
    category: 'automotive',
    price: 5.99,
    stock: 42,
    brand: 'ACME',
    sku: 'ACM-FC-002',
    weight: 3.25,
    meta: { createdAt: '2025-04-29T19:36:02.053Z', updatedAt: '2025-04-30T09:41:02.053Z' },
  },
];

const pageMeta = (total: number) => ({ page: 1, pageSize: 30, total, totalPages: 1 });

/** Swagger UI would otherwise invent values from the schema, such as a random string for a slug. */
const SUCCESS_EXAMPLES: Record<string, unknown> = {
  ProductResponse: { data: PRODUCT_EXAMPLES[0] },
  ProductList: { data: PRODUCT_EXAMPLES, meta: pageMeta(PRODUCT_EXAMPLES.length) },
  ProductStatsResponse: {
    data: { total: 36, inStock: 24, lowStock: 7, outOfStock: 5, inventoryValue: 18432.75 },
  },
  CategoryResponse: { data: { slug: 'automotive' } },
  CategoryList: { data: [{ slug: 'automotive' }, { slug: 'kitchen' }], meta: pageMeta(2) },
  BrandResponse: { data: { name: 'ACME' } },
  BrandList: { data: [{ name: 'ACME' }, { name: 'Globex' }], meta: pageMeta(2) },
};

/** `{ data: T }` and `{ data: T[], meta }` envelopes from §3.1. */
const item = (name: string): Schema => ({
  type: 'object',
  properties: { data: ref(name) },
  required: ['data'],
});
const list = (name: string): Schema => ({
  type: 'object',
  properties: { data: { type: 'array', items: ref(name) }, meta: ref('PageMeta') },
  required: ['data', 'meta'],
});

function componentSchemas(): Record<string, Schema> {
  return {
    Product: jsonSchema(productSchema, 'output'),
    CreateProduct: jsonSchema(createProductSchema, 'input'),
    PatchProduct: { ...jsonSchema(patchProductSchema, 'input'), minProperties: 1 },
    ProductStats: jsonSchema(productStatsSchema, 'output'),
    Category: jsonSchema(categorySchema, 'output'),
    CreateCategory: jsonSchema(createCategorySchema, 'input'),
    Brand: jsonSchema(brandSchema, 'output'),
    CreateBrand: jsonSchema(createBrandSchema, 'input'),
    PageMeta: {
      type: 'object',
      description: '`total` is counted after filters and before pagination.',
      properties: {
        page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1 },
        total: { type: 'integer', minimum: 0 },
        totalPages: { type: 'integer', minimum: 0 },
      },
      required: ['page', 'pageSize', 'total', 'totalPages'],
    },
    ProductResponse: item('Product'),
    ProductList: list('Product'),
    ProductStatsResponse: item('ProductStats'),
    CategoryResponse: item('Category'),
    CategoryList: list('Category'),
    BrandResponse: item('Brand'),
    BrandList: list('Brand'),
    Error: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', enum: [...ERROR_CODES] },
            message: { type: 'string' },
            details: {
              type: 'array',
              description: 'Every failing field. Present on validation errors.',
              items: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                    description: 'Dotted field path; empty for the whole body.',
                  },
                  message: { type: 'string' },
                },
                required: ['path', 'message'],
              },
            },
          },
          required: ['code', 'message'],
        },
      },
      required: ['error'],
    },
  };
}

const ERROR_RESPONSES = {
  '400': 'Validation failed (`VALIDATION_ERROR`). `details` lists every failing field.',
  '404': 'No such product, category or brand (`NOT_FOUND`).',
  '409':
    'Conflict (`CONFLICT`), such as a duplicate `sku`, category slug or brand name, or a category or brand still in use.',
  '500':
    'Unexpected error (`INTERNAL_ERROR`). The message is generic; the cause is logged server-side.',
} as const;

type ErrorStatus = keyof typeof ERROR_RESPONSES;

interface ErrorExample {
  code: string;
  message: string;
  details?: { path: string; message: string }[];
}

/**
 * One example per status, so a 409 does not show a validation error. Operations
 * override these where the contract names the failing field.
 */
const DEFAULT_ERROR_EXAMPLES: Record<ErrorStatus, ErrorExample> = {
  '400': {
    code: 'VALIDATION_ERROR',
    message: 'Invalid request',
    details: [{ path: 'pageSize', message: 'must be <= 100' }],
  },
  '404': { code: 'NOT_FOUND', message: 'Product 7 not found' },
  '409': {
    code: 'CONFLICT',
    message: 'sku already exists',
    details: [{ path: 'sku', message: 'is already in use' }],
  },
  '500': { code: 'INTERNAL_ERROR', message: 'Internal server error' },
};

const validationError = (path: string, message: string): ErrorExample => ({
  code: 'VALIDATION_ERROR',
  message: 'Invalid request',
  details: [{ path, message }],
});

interface OperationSpec {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  tag: 'Products' | 'Categories' | 'Brands';
  summary: string;
  description: string;
  parameters?: unknown[];
  requestBody?: { schema: string; example: unknown };
  success: { status: '200' | '201' | '204'; description: string; schema?: string };
  errors: ErrorStatus[];
  errorExamples?: Partial<Record<ErrorStatus, ErrorExample>>;
}

function operationSpecs(): OperationSpec[] {
  const query = jsonSchema(listQuerySchema, 'input').properties as Record<string, Schema>;
  const queryParam = (name: string, description: string) => ({
    name,
    in: 'query',
    required: false,
    description,
    schema: query[name],
  });
  const idParam = {
    name: 'id',
    in: 'path',
    required: true,
    description: 'Product id.',
    schema: { type: 'integer', minimum: 1 },
  };
  const slugParam = {
    name: 'slug',
    in: 'path',
    required: true,
    description: 'Category slug.',
    schema: (jsonSchema(categorySlugParamSchema, 'input').properties as Record<string, Schema>)
      .slug,
  };
  const nameParam = {
    name: 'name',
    in: 'path',
    required: true,
    description: 'Brand name, URL-encoded.',
    schema: (jsonSchema(brandNameParamSchema, 'input').properties as Record<string, Schema>).name,
  };
  const pageParams = [
    queryParam('page', '1-based page number.'),
    queryParam('pageSize', 'Items per page. Values above the maximum are rejected, not clamped.'),
  ];

  return [
    {
      method: 'get',
      path: '/api/products',
      tag: 'Products',
      summary: 'List products',
      description:
        'A page of products. Search, category and brand filters, sort and paging compose, and `meta.total` ' +
        'is counted after filters and before pagination. `q` is a case-insensitive substring ' +
        'match over title and description.',
      parameters: [
        ...pageParams,
        queryParam('q', 'Case-insensitive substring match over title and description.'),
        queryParam('category', 'Only products in this category (slug).'),
        queryParam('brand', 'Only products of this brand (name).'),
        queryParam(
          'stockStatus',
          `Only products in this stock band: \`out\` is 0 units, \`low\` is 1 up to ${LOW_STOCK_THRESHOLD}, ` +
            `\`in\` is more than ${LOW_STOCK_THRESHOLD}.`,
        ),
        queryParam('sort', 'Sort field; a leading `-` sorts descending, for example `-price`.'),
      ],
      success: { status: '200', description: 'A page of products.', schema: 'ProductList' },
      errors: ['400', '500'],
    },
    {
      method: 'get',
      path: '/api/products/stats',
      tag: 'Products',
      summary: 'Get catalog stats',
      description:
        'Catalog-wide headline numbers: the product count by stock status and the value of the ' +
        'stock on hand (`price * stock`, summed exactly in cents). Not scoped by search or ' +
        'category, so it stays a stable overview. The stock bands are the ones the ' +
        '`stockStatus` list filter uses.',
      success: { status: '200', description: 'The catalog stats.', schema: 'ProductStatsResponse' },
      errors: ['500'],
    },
    {
      method: 'post',
      path: '/api/products',
      tag: 'Products',
      summary: 'Create a product',
      description:
        'Validates the full body and creates the product. `id` and `meta` are assigned by the ' +
        'server and ignored if sent. The category and the brand must already exist.',
      requestBody: {
        schema: 'CreateProduct',
        example: {
          title: 'Large Flux Capacitor',
          description:
            'The Large Flux Capacitor provides the maximum motive force for your inter-dimensional aluminum automobile.',
          category: 'automotive',
          price: 9.99,
          stock: 42,
          brand: 'ACME',
          sku: 'ACM-FC-001',
          weight: 4,
        },
      },
      success: { status: '201', description: 'The created product.', schema: 'ProductResponse' },
      errors: ['400', '409', '500'],
      errorExamples: { '400': validationError('price', 'must be >= 0') },
    },
    {
      method: 'get',
      path: '/api/products/{id}',
      tag: 'Products',
      summary: 'Get a product',
      description: 'One product by id. A non-numeric id is a validation error.',
      parameters: [idParam],
      success: { status: '200', description: 'The product.', schema: 'ProductResponse' },
      errors: ['400', '404', '500'],
      errorExamples: { '400': validationError('id', 'must be an integer') },
    },
    {
      method: 'patch',
      path: '/api/products/{id}',
      tag: 'Products',
      summary: 'Update a product',
      description:
        'Updates any non-empty subset of the product fields and refreshes `meta.updatedAt`. ' +
        '`meta.createdAt` is untouched.',
      parameters: [idParam],
      requestBody: { schema: 'PatchProduct', example: { price: 7.99, stock: 40 } },
      success: { status: '200', description: 'The updated product.', schema: 'ProductResponse' },
      errors: ['400', '404', '409', '500'],
      errorExamples: { '400': validationError('', 'must include at least one field') },
    },
    {
      method: 'delete',
      path: '/api/products/{id}',
      tag: 'Products',
      summary: 'Delete a product',
      description: 'Removes the product. A second delete of the same id is a `404`.',
      parameters: [idParam],
      success: { status: '204', description: 'Deleted. The response has no body.' },
      errors: ['400', '404', '500'],
      errorExamples: { '400': validationError('id', 'must be an integer') },
    },
    {
      method: 'get',
      path: '/api/categories',
      tag: 'Categories',
      summary: 'List categories',
      description: 'A page of categories, in the same envelope as the product list.',
      parameters: pageParams,
      success: { status: '200', description: 'A page of categories.', schema: 'CategoryList' },
      errors: ['400', '500'],
    },
    {
      method: 'post',
      path: '/api/categories',
      tag: 'Categories',
      summary: 'Create a category',
      description: 'Creates a category from its slug.',
      requestBody: { schema: 'CreateCategory', example: { slug: 'automotive' } },
      success: { status: '201', description: 'The created category.', schema: 'CategoryResponse' },
      errors: ['400', '409', '500'],
      errorExamples: {
        '400': validationError(
          'slug',
          'must be a lowercase slug (letters, digits and single hyphens)',
        ),
        '409': {
          code: 'CONFLICT',
          message: 'category already exists',
          details: [{ path: 'slug', message: 'already exists' }],
        },
      },
    },
    {
      method: 'delete',
      path: '/api/categories/{slug}',
      tag: 'Categories',
      summary: 'Delete a category',
      description:
        'Removes an unused category. A category that any product still uses is a `409`; ' +
        'products are never reassigned or deleted.',
      parameters: [slugParam],
      success: { status: '204', description: 'Deleted. The response has no body.' },
      errors: ['400', '404', '409', '500'],
      errorExamples: {
        '400': validationError(
          'slug',
          'must be a lowercase slug (letters, digits and single hyphens)',
        ),
        '404': { code: 'NOT_FOUND', message: 'Category "ghost-town" not found' },
        '409': {
          code: 'CONFLICT',
          message: 'Category "automotive" still has products',
          details: [{ path: 'category', message: 'is still used by at least one product' }],
        },
      },
    },
    {
      method: 'get',
      path: '/api/brands',
      tag: 'Brands',
      summary: 'List brands',
      description:
        'A page of brands in alphabetical order, in the same envelope as the product list.',
      parameters: pageParams,
      success: { status: '200', description: 'A page of brands.', schema: 'BrandList' },
      errors: ['400', '500'],
    },
    {
      method: 'post',
      path: '/api/brands',
      tag: 'Brands',
      summary: 'Create a brand',
      description: 'Creates a brand from its name.',
      requestBody: { schema: 'CreateBrand', example: { name: 'ACME' } },
      success: { status: '201', description: 'The created brand.', schema: 'BrandResponse' },
      errors: ['400', '409', '500'],
      errorExamples: {
        '400': validationError('name', 'is required'),
        '409': {
          code: 'CONFLICT',
          message: 'A brand "ACME" already exists',
          details: [{ path: 'name', message: 'is already in use' }],
        },
      },
    },
    {
      method: 'delete',
      path: '/api/brands/{name}',
      tag: 'Brands',
      summary: 'Delete a brand',
      description:
        'Removes an unused brand. A brand that any product still uses is a `409`; ' +
        'products are never reassigned or deleted.',
      parameters: [nameParam],
      success: { status: '204', description: 'Deleted. The response has no body.' },
      errors: ['400', '404', '409', '500'],
      errorExamples: {
        '400': validationError('name', 'must not contain "/"'),
        '404': { code: 'NOT_FOUND', message: 'Brand "Initech" not found' },
        '409': {
          code: 'CONFLICT',
          message: 'Brand "ACME" still has products',
          details: [{ path: 'brand', message: 'is still used by at least one product' }],
        },
      },
    },
  ];
}

function buildOperation(spec: OperationSpec, implemented: boolean) {
  const responses: Record<string, unknown> = {
    [spec.success.status]: {
      description: spec.success.description,
      ...(spec.success.schema && {
        content: jsonContent(ref(spec.success.schema), SUCCESS_EXAMPLES[spec.success.schema]),
      }),
    },
  };
  for (const status of [...spec.errors].sort()) {
    const example = spec.errorExamples?.[status] ?? DEFAULT_ERROR_EXAMPLES[status];
    responses[status] = {
      description: ERROR_RESPONSES[status],
      content: jsonContent(ref('Error'), { error: example }),
    };
  }

  return {
    tags: [spec.tag],
    summary: spec.summary,
    description: (implemented ? '' : NOT_IMPLEMENTED) + spec.description,
    ...(spec.parameters && { parameters: spec.parameters }),
    ...(spec.requestBody && {
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref(spec.requestBody.schema),
            example: spec.requestBody.example,
          },
        },
      },
    }),
    responses,
    'x-implemented': implemented,
  };
}

/**
 * The OpenAPI 3.1 document for the API contract in docs/technical-decisions.md §3.
 * `implemented` holds the `METHOD /api/path/{param}` keys that have a registered
 * route; every other operation is flagged as not implemented yet.
 */
export function buildOpenApiDocument(implemented: ReadonlySet<string>) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const spec of operationSpecs()) {
    const key = `${spec.method.toUpperCase()} ${spec.path}`;
    (paths[spec.path] ??= {})[spec.method] = buildOperation(spec, implemented.has(key));
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Product Catalog API',
      version: API_VERSION,
      description:
        'JSON API for the product catalog. Requests and responses are described by the same ' +
        'schemas the server validates with. Operations marked **Not implemented yet** are part ' +
        'of the agreed contract (`docs/technical-decisions.md` §3) but do not have a route yet.',
    },
    tags: [
      { name: 'Products', description: 'Browse, search and maintain products.' },
      { name: 'Categories', description: 'The categories products belong to.' },
      { name: 'Brands', description: 'The brands products are sold under.' },
    ],
    paths,
    components: { schemas: componentSchemas() },
  };
}
