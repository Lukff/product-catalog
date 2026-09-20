import { ZodError, zodIssuesToDetails, type ErrorResponse } from '@catalog/shared';
import type { ErrorHandler, NotFoundHandler } from 'hono';
import { AppError } from '../errors.js';

/**
 * The only place an error response is written. Routes and services throw;
 * this maps what they throw onto the §3.3 shapes.
 */
export const handleError: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    const body: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    };
    return c.json(body, err.status);
  }

  if (err instanceof ZodError) {
    const body: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: zodIssuesToDetails(err),
      },
    };
    return c.json(body, 400);
  }

  // Unexpected: log the real error, tell the client nothing about it.
  console.error(err);
  const body: ErrorResponse = {
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  };
  return c.json(body, 500);
};

export const handleNotFound: NotFoundHandler = (c) => {
  const body: ErrorResponse = { error: { code: 'NOT_FOUND', message: 'Route not found' } };
  return c.json(body, 404);
};
