import { NextFunction, Request, Response } from 'express';
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

/** Wraps an async route so rejections are passed to Express `next` (central error handler). */
export const wrapAsyncRoute =
  <T extends Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: T, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export const handleErrorResponse = (err: Error | AppError, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  log.error(message, { statusCode, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(err instanceof AppError && err.details ? err.details : {}),
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
