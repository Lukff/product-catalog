import { createProductSchema, listQuerySchema, productIdParamSchema } from '@catalog/shared';
import { Hono } from 'hono';
import { readJsonBody } from './json-body.js';
import type { ProductService } from '../services/product-service.js';

export function productRoutes(service: ProductService) {
  const routes = new Hono();

  // A ZodError from `parse` is turned into `400 VALIDATION_ERROR` by the error handler.
  routes.get('/', (c) => c.json(service.list(listQuerySchema.parse(c.req.query()))));

  routes.get('/:id', (c) => {
    const { id } = productIdParamSchema.parse(c.req.param());
    return c.json({ data: service.get(id) });
  });

  routes.post('/', async (c) => {
    const input = createProductSchema.parse(await readJsonBody(c));
    return c.json({ data: service.create(input) }, 201);
  });

  return routes;
}
