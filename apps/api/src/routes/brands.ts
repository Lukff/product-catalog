import { brandListQuerySchema, brandNameParamSchema, createBrandSchema } from '@catalog/shared';
import { Hono } from 'hono';
import { readJsonBody } from './json-body.js';
import type { BrandService } from '../services/brand-service.js';

export function brandRoutes(service: BrandService) {
  const routes = new Hono();

  routes.get('/', (c) => c.json(service.list(brandListQuerySchema.parse(c.req.query()))));

  routes.post('/', async (c) => {
    const { name } = createBrandSchema.parse(await readJsonBody(c));
    return c.json({ data: service.create(name) }, 201);
  });

  routes.delete('/:name', (c) => {
    const { name } = brandNameParamSchema.parse(c.req.param());
    service.delete(name);
    return c.body(null, 204);
  });

  return routes;
}
