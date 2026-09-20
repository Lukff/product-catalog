import type { ErrorDetail } from './envelope.js';

/**
 * Re-exported so the API can recognise a validation failure with `instanceof`
 * against the very class the shared schemas throw, without its own `zod` dependency.
 */
export { ZodError } from 'zod';

interface IssueLike {
  path: readonly PropertyKey[];
  message: string;
}

/**
 * Turns Zod issues into the `details` array of a `VALIDATION_ERROR`. Paths are
 * dotted (`meta.createdAt`); an issue on the whole payload has the empty path.
 * The API and the web form both use this, so field names and messages agree.
 */
export function zodIssuesToDetails(error: { issues: readonly IssueLike[] }): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
