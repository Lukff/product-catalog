import type {
  ErrorCode,
  ErrorDetail,
  ErrorResponse,
  ItemResponse,
  ListResponse,
} from '@catalog/shared';

/** `NETWORK_ERROR` is client-side only: the request never produced an HTTP response. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR';

/**
 * The rejection every failed call produces. `code`, `message` and `details` come from the API's
 * error envelope, so a form can map `details` back onto its fields.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: ErrorDetail[];

  constructor(status: number, code: ApiErrorCode, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const BASE_PATH = '/api';

type QueryValue = string | number | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE_PATH}${path}${qs ? `?${qs}` : ''}`;
}

function isErrorResponse(body: unknown): body is ErrorResponse {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const { error } = body;
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Sends the request and returns the parsed JSON body (`undefined` for an empty 204). */
async function send(method: string, path: string, options: RequestOptions): Promise<unknown> {
  const init: RequestInit = { method, signal: options.signal };
  if (options.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), init);
  } catch (cause) {
    // An aborted request is the caller's own doing; let it through untouched.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
  }

  const body = response.status === 204 ? undefined : await readJson(response);

  if (!response.ok) {
    if (isErrorResponse(body)) {
      const { code, message, details } = body.error;
      throw new ApiError(response.status, code, message, details);
    }
    // A proxy or crash page instead of the API's envelope.
    throw new ApiError(
      response.status,
      'INTERNAL_ERROR',
      response.statusText || 'Unexpected server response',
    );
  }
  return body;
}

/** Single-resource call: resolves with the envelope's `data`. */
async function item<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const body = (await send(method, path, options)) as ItemResponse<T>;
  return body.data;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => item<T>('GET', path, options),
  post: <T>(path: string, body: unknown, options?: RequestOptions) =>
    item<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
    item<T>('PATCH', path, { ...options, body }),

  /** Collection call: keeps `meta`, since paging needs it alongside `data`. */
  list: async <T>(path: string, options?: RequestOptions): Promise<ListResponse<T>> =>
    (await send('GET', path, options ?? {})) as ListResponse<T>,

  /** `DELETE` answers 204 with no body. */
  delete: async (path: string, options?: RequestOptions): Promise<void> => {
    await send('DELETE', path, options ?? {});
  },
};
