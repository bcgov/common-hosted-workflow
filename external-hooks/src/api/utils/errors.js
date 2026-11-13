'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.handleErrorResponse = exports.AppError = void 0;
const _config_1 = require('@config');
const logger_1 = require('./logger');
const log = (0, logger_1.createLogger)('ErrorHandler');
class AppError extends Error {
  statusCode;
  /** Extra fields merged into JSON error responses (e.g. conflict ids). */
  details;
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'AppError';
  }
}
exports.AppError = AppError;
const handleErrorResponse = (err, _req, res, _next) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';
  log.error(message, { statusCode, stack: _config_1.IS_DEVELOPMENT ? err.stack : undefined });
  const error = { message };
  if (err instanceof AppError && err.details) {
    error.details = err.details;
  }
  if (_config_1.IS_DEVELOPMENT) {
    error.stack = err.stack;
  }
  res.status(statusCode).json({ error });
};
exports.handleErrorResponse = handleErrorResponse;
