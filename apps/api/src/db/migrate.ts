import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.js';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/** Applies any migrations the database has not seen. Safe to run repeatedly. */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder });
}
