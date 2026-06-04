/**
 * Shared test utilities for external-hooks unit tests.
 *
 * Provides route-handler extraction, handler-chain execution,
 * and assertion helpers to eliminate duplication across test files.
 */
import { expect } from 'vitest';
import { AppError } from '../../src/api/utils/errors';

/* ------------------------------------------------------------------ */
/*  Route handler extraction                                           */
/* ------------------------------------------------------------------ */

/**
 * Extracts all handlers (middleware + route handler) from the Express
 * Router stack for a given method + path. Returns `null` if not found.
 */
export function getRouteHandlers(router: any, method: string, path: string): Array<(...args: any[]) => any> | null {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
      return layer.route.stack.map((s: any) => s.handle);
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Handler chain execution                                            */
/* ------------------------------------------------------------------ */

/**
 * Runs the full middleware chain for a route (validators + handler).
 * Stops at the first middleware that calls `next(error)` or throws.
 * Returns the error (or `null` if the chain completed successfully).
 */
export async function runHandlerChain(
  handlers: Array<(req: any, res: any, next: any) => any>,
  req: any,
  res: any,
): Promise<unknown> {
  let error: unknown = null;
  for (const handler of handlers) {
    if (error) break;
    await new Promise<void>((resolve) => {
      const next = (err?: unknown) => {
        if (err) error = err;
        resolve();
      };
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') {
        result
          .then(() => resolve())
          .catch((err: unknown) => {
            error = err;
            resolve();
          });
      }
    });
  }
  return error;
}

/* ------------------------------------------------------------------ */
/*  Assertion helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Asserts that `next` was called with an `AppError` having the expected
 * status code. Convenience wrapper for the common two-line pattern:
 *
 *   expect(next).toHaveBeenCalledWith(expect.any(AppError));
 *   expect((next.mock.calls[0][0] as AppError).statusCode).toBe(403);
 */
export function expectNextAppError(next: ReturnType<typeof import('vitest').vi.fn>, expectedStatus: number) {
  expect(next).toHaveBeenCalledWith(expect.any(AppError));
  expect((next.mock.calls[0][0] as AppError).statusCode).toBe(expectedStatus);
}

/**
 * Asserts that a promise rejects with an `AppError` having the expected
 * status code. Handles both async throwing and sync throwing.
 *
 * Usage:
 *   await expectRejectsAppError(someAsyncFn(), 403);
 */
export async function expectRejectsAppError(promise: Promise<unknown>, expectedStatus: number): Promise<void> {
  try {
    await promise;
    expect.unreachable('Expected AppError to be thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(expectedStatus);
  }
}
