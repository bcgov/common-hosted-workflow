import { NextFunction, Request, Response } from 'express';
import { IS_DEVELOPMENT } from '@config';
import { createLogger } from './logger';

const log = createLogger('ErrorHandler');

export class AppError extends Error {
  readonly statusCode: number;
  /** Extra fields merged into JSON error responses (e.g. conflict ids). */
  readonly details?: Record<string, unknown>;

  constructor(statusCode: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'AppError';
  }
}

export const handleErrorResponse = (err: Error | AppError, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  log.error(message, { statusCode, stack: IS_DEVELOPMENT ? err.stack : undefined });

  const error: Record<string, unknown> = { message };

  if (err instanceof AppError && err.details) {
    error.details = err.details;
  }

  if (IS_DEVELOPMENT) {
    error.stack = err.stack;
  }

  res.status(statusCode).json({ error });
};
