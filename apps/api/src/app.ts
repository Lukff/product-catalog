import { Hono } from 'hono';
import type { Db } from './db/client.js';
import { handleError, handleNotFound } from './middleware/error-handler.js';

export interface AppDeps {
  db: Db;
}

/**
 * Builds the API. Taking the database as a dependency lets tests run the real
 * app against a throwaway SQLite file with `app.request()` and no open port.
 * Product routes are wired here from B-06 onward.
 */
export function createApp(_deps: AppDeps) {
  const app = new Hono();

  app.onError(handleError);
  app.notFound(handleNotFound);

  return app;
}
