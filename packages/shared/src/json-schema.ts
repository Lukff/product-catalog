/**
 * Re-exported so the API can publish the shared schemas as JSON Schema (for the
 * OpenAPI document) with the very `zod` instance that defined them, without its
 * own `zod` dependency.
 */
export { toJSONSchema } from 'zod';
export type { ZodType } from 'zod';
