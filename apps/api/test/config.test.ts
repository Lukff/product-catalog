import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('falls back to defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({ port: 3000, databasePath: './data/catalog.db' });
  });

  it('reads PORT and DATABASE_PATH from the environment', () => {
    expect(loadConfig({ PORT: '8080', DATABASE_PATH: '/tmp/other.db' })).toEqual({
      port: 8080,
      databasePath: '/tmp/other.db',
    });
  });

  it('treats blank values as unset', () => {
    expect(loadConfig({ PORT: '', DATABASE_PATH: '' })).toEqual({
      port: 3000,
      databasePath: './data/catalog.db',
    });
  });

  it.each(['abc', '0', '-1', '65536', '80.5'])('rejects PORT=%s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT/);
  });
});
