import { loadConfig } from '../config.js';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';

const { databasePath } = loadConfig();
const db = createDb(databasePath);

try {
  runMigrations(db);
  console.log(`Migrations applied to ${databasePath}`);
} finally {
  db.$client.close();
}
