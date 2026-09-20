import { listQuerySchema } from '@catalog/shared';
import { Hono } from 'hono';
import type { ProductService } from '../services/product-service.js';

export function productRoutes(service: ProductService) {
  const routes = new Hono();

  // A ZodError from `parse` is turned into `400 VALIDATION_ERROR` by the error handler.
  // `q`, `category` and `sort` are validated here but only applied from B-08.
  routes.get('/', (c) => c.json(service.list(listQuerySchema.parse(c.req.query()))));

  return routes;
}
