import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** Opens (creating the file and its directory if needed) a SQLite database with foreign keys enforced. */
export function createDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  // SQLite ignores foreign keys unless this is switched on for every connection.
  sqlite.pragma('foreign_keys = ON');

  return drizzle(sqlite, { schema });
}
