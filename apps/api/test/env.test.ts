import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { loadDotEnv } from '../src/env.js';

const KEYS = ['CATALOG_TEST_A', 'CATALOG_TEST_B', 'PORT', 'DATABASE_PATH'];

let dir: string;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'catalog-env-'));
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  rmSync(dir, { recursive: true, force: true });
});

function envFile(contents: string): string {
  const path = join(dir, '.env');
  writeFileSync(path, contents);
  return path;
}

describe('loadDotEnv', () => {
  it('loads variables from the file into the environment', () => {
    loadDotEnv(envFile('CATALOG_TEST_A=hello\nCATALOG_TEST_B=world\n'));

    expect(process.env.CATALOG_TEST_A).toBe('hello');
    expect(process.env.CATALOG_TEST_B).toBe('world');
  });

  it('never overrides a variable that is already set', () => {
    process.env.CATALOG_TEST_A = 'from-the-shell';

    loadDotEnv(envFile('CATALOG_TEST_A=from-the-file\n'));

    expect(process.env.CATALOG_TEST_A).toBe('from-the-shell');
  });

  it('does nothing when the file does not exist', () => {
    expect(() => loadDotEnv(join(dir, 'missing.env'))).not.toThrow();
    expect(process.env.CATALOG_TEST_A).toBeUndefined();
  });

  it('ignores comments and blank lines', () => {
    loadDotEnv(envFile('# a comment\n\nCATALOG_TEST_A=value\n'));

    expect(process.env.CATALOG_TEST_A).toBe('value');
  });

  it('feeds the values into loadConfig', () => {
    loadDotEnv(envFile('PORT=4321\nDATABASE_PATH=./elsewhere.db\n'));

    expect(loadConfig()).toEqual({ port: 4321, databasePath: './elsewhere.db' });
  });
});
