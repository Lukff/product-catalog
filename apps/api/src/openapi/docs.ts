import { swaggerUI } from '@hono/swagger-ui';
import type { Hono } from 'hono';
import { buildOpenApiDocument } from './document.js';

export const OPENAPI_PATH = '/api/openapi.json';
export const DOCS_PATH = '/api/docs';

/** Hono `/api/products/:id` -> OpenAPI `/api/products/{id}`. */
function toOpenApiPath(path: string): string {
  return path.replace(/:(\w+)(\{[^}]*\})?/g, '{$1}');
}

/**
 * The operations that currently have a route. Read from the app at request time,
 * so routes registered after `registerDocs` are picked up, and an operation stops
 * being flagged "not implemented" the moment its route exists.
 */
function implementedOperations(app: Hono): Set<string> {
  return new Set(
    app.routes
      .filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${toOpenApiPath(route.path)}`),
  );
}

/** Serves the OpenAPI document as JSON and a Swagger UI page that renders it. */
export function registerDocs(app: Hono): void {
  app.get(OPENAPI_PATH, (c) => c.json(buildOpenApiDocument(implementedOperations(app))));
  app.get(DOCS_PATH, swaggerUI({ url: OPENAPI_PATH }));
}
