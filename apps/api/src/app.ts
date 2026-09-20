import { Hono } from 'hono';
import type { Db } from './db/client.js';
import { handleError, handleNotFound } from './middleware/error-handler.js';
import { registerDocs } from './openapi/docs.js';
import { createProductRepository } from './repositories/product-repository.js';
import { productRoutes } from './routes/products.js';
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

  return app;
}
