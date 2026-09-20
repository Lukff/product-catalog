import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb, type Db } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';

export interface TestDb {
  db: Db;
  cleanup: () => void;
}

/** A migrated SQLite database in its own temp directory, removed by `cleanup`. */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-test-'));
  const db = createDb(join(dir, 'test.db'));
  runMigrations(db);

  return {
    db,
    cleanup: () => {
      db.$client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
