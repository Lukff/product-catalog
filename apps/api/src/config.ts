export interface Config {
  port: number;
  databasePath: string;
}

const DEFAULT_PORT = 3000;
const DEFAULT_DATABASE_PATH = './data/catalog.db';

/** Reads configuration from the environment; blank values count as unset. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: parsePort(env.PORT),
    databasePath: env.DATABASE_PATH || DEFAULT_DATABASE_PATH,
  };
}

function parsePort(raw: string | undefined): number {
  if (!raw) return DEFAULT_PORT;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${raw}"`);
  }
  return port;
}
