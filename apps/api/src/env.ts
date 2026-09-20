import { existsSync } from 'node:fs';

/**
 * Loads `.env` into `process.env` if the file exists. Variables that are already
 * set win over the file, so a real environment always overrides local defaults.
 * Relative to the working directory, which is `apps/api` for every pnpm script.
 */
export function loadDotEnv(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
