import type { Context } from 'hono';
import { ValidationError } from '../errors.js';

/** Parses the request body as JSON; malformed JSON is the client's mistake (400), not a server error. */
export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ValidationError('Invalid request', [{ path: '', message: 'must be valid JSON' }]);
  }
}
