import { toJSONSchema, type ZodType } from '@catalog/shared';

export type Schema = Record<string, unknown>;

/**
 * JSON Schema for a shared Zod schema, tidied for an OpenAPI document. Use
 * `input` for request bodies and query strings (what a client sends, before
 * coercion and transforms) and `output` for responses.
 */
export function jsonSchema(schema: ZodType, io: 'input' | 'output'): Schema {
  return tidy(toJSONSchema(schema, { io, target: 'draft-2020-12' })) as Schema;
}

/** Drops generator noise that only makes the rendered docs harder to read. */
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy);
  if (node === null || typeof node !== 'object') return node;

  const source = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === '$schema') continue;
    // Zod bounds every integer by the safe-integer range; it says nothing useful to a reader.
    if (key === 'maximum' && value === Number.MAX_SAFE_INTEGER) continue;
    // The date-time regex is huge and `format: date-time` already says it.
    if (key === 'pattern' && source.format === 'date-time') continue;
    result[key] = tidy(value);
  }
  return result;
}
