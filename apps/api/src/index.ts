import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { loadDotEnv } from './env.js';

loadDotEnv();
const config = loadConfig();
const app = createApp({ db: createDb(config.databasePath) });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
