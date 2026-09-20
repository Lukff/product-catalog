import {
  categoryListQuerySchema,
  categorySlugParamSchema,
  createCategorySchema,
} from '@catalog/shared';
import { Hono } from 'hono';
import { readJsonBody } from './json-body.js';
import type { CategoryService } from '../services/category-service.js';

export function categoryRoutes(service: CategoryService) {
  const routes = new Hono();

  routes.get('/', (c) => c.json(service.list(categoryListQuerySchema.parse(c.req.query()))));

  routes.post('/', async (c) => {
    const { slug } = createCategorySchema.parse(await readJsonBody(c));
    return c.json({ data: service.create(slug) }, 201);
  });

  routes.delete('/:slug', (c) => {
    const { slug } = categorySlugParamSchema.parse(c.req.param());
    service.delete(slug);
    return c.body(null, 204);
  });

  return routes;
}
