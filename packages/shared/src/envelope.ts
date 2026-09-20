/** Pagination block on collection responses. `total` is counted after filters, before paging. */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Single-resource response body. */
export interface ItemResponse<T> {
  data: T;
}

/** Collection response body. */
export interface ListResponse<T> {
  data: T[];
  meta: PageMeta;
}

export const ERROR_CODES = ['VALIDATION_ERROR', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_ERROR'] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** One failing field. `path` is dotted, e.g. `price` or `meta.createdAt`. */
export interface ErrorDetail {
  path: string;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}
