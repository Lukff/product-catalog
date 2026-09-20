import { loadConfig } from '../config.js';
import { loadDotEnv } from '../env.js';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';
import { loadSeedData, seedDatabase } from './seed.js';

loadDotEnv();
const { databasePath } = loadConfig();
const db = createDb(databasePath);

try {
  // Idempotent, so a fresh checkout needs only `pnpm db:seed`.
  runMigrations(db);

  const data = loadSeedData();
  const added = seedDatabase(db, data);
  const skipped = data.length - added.products;
  console.log(
    `Seeded ${databasePath}: added ${added.products} products and ${added.categories} categories` +
      (skipped > 0 ? ` (${skipped} products were already present).` : '.'),
  );
} finally {
  db.$client.close();
}
