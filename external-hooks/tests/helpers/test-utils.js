'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getRouteHandlers = getRouteHandlers;
exports.runHandlerChain = runHandlerChain;
exports.expectNextAppError = expectNextAppError;
exports.expectRejectsAppError = expectRejectsAppError;
/**
 * Shared test utilities for external-hooks unit tests.
 *
 * Provides route-handler extraction, handler-chain execution,
 * and assertion helpers to eliminate duplication across test files.
 */
const vitest_1 = require('vitest');
const errors_1 = require('../../src/api/utils/errors');
/* ------------------------------------------------------------------ */
/*  Route handler extraction                                           */
/* ------------------------------------------------------------------ */
/**
 * Extracts all handlers (middleware + route handler) from the Express
 * Router stack for a given method + path. Returns `null` if not found.
 */
function getRouteHandlers(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
      return layer.route.stack.map((s) => s.handle);
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
async function runHandlerChain(handlers, req, res) {
  let error = null;
  for (const handler of handlers) {
    if (error) break;
    await new Promise((resolve) => {
      const next = (err) => {
        if (err) error = err;
        resolve();
      };
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') {
        result
          .then(() => resolve())
          .catch((err) => {
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
function expectNextAppError(next, expectedStatus) {
  (0, vitest_1.expect)(next).toHaveBeenCalledWith(vitest_1.expect.any(errors_1.AppError));
  (0, vitest_1.expect)(next.mock.calls[0][0].statusCode).toBe(expectedStatus);
}
/**
 * Asserts that a promise rejects with an `AppError` having the expected
 * status code. Handles both async throwing and sync throwing.
 *
 * Usage:
 *   await expectRejectsAppError(someAsyncFn(), 403);
 */
async function expectRejectsAppError(promise, expectedStatus) {
  try {
    await promise;
    vitest_1.expect.unreachable('Expected AppError to be thrown');
  } catch (err) {
    (0, vitest_1.expect)(err).toBeInstanceOf(errors_1.AppError);
    (0, vitest_1.expect)(err.statusCode).toBe(expectedStatus);
  }
}
