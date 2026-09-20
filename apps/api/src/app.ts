import { Hono } from 'hono';
import type { Db } from './db/client.js';
import { handleError, handleNotFound } from './middleware/error-handler.js';
import { registerDocs } from './openapi/docs.js';
import { createBrandRepository } from './repositories/brand-repository.js';
import { createCategoryRepository } from './repositories/category-repository.js';
import { createProductRepository } from './repositories/product-repository.js';
import { brandRoutes } from './routes/brands.js';
import { categoryRoutes } from './routes/categories.js';
import { productRoutes } from './routes/products.js';
import { createBrandService } from './services/brand-service.js';
import { createCategoryService } from './services/category-service.js';
import { createProductService } from './services/product-service.js';

export interface AppDeps {
  db: Db;
}

/**
 * Builds the API. Taking the database as a dependency lets tests run the real
 * app against a throwaway SQLite file with `app.request()` and no open port.
 * Each resource is composed here as repository -> service -> routes.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.onError(handleError);
  app.notFound(handleNotFound);
  registerDocs(app);

  const products = createProductService(createProductRepository(deps.db));
  app.route('/api/products', productRoutes(products));

  const categories = createCategoryService(createCategoryRepository(deps.db));
  app.route('/api/categories', categoryRoutes(categories));

  const brands = createBrandService(createBrandRepository(deps.db));
  app.route('/api/brands', brandRoutes(brands));

  return app;
}
