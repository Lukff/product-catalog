import type { ErrorCode, ErrorDetail } from '@catalog/shared';

/**
 * A failure the API expects and reports to the client. Services throw these;
 * the error middleware turns them into the §3.3 response. Repositories never do.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: 400 | 404 | 409 | 500,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: ErrorDetail[]) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super('CONFLICT', 409, message, details);
  }
}
