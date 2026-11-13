"use strict";
/**
 * Centralized logging library for external endpoint interactions.
 *
 * Zero-dependency structured JSON logger built on Node.js console.
 * Provides consistent log format, configurable levels, child loggers
 * with module context, and helpers for request/response/error details.
 *
 * Configuration (environment variables):
 *   LOG_LEVEL  – minimum level to emit: "debug" | "info" | "warn" | "error" (default: "info")
 *
 * Usage:
 *   import { logger, createLogger } from './utils/logger';
 *
 *   // Root logger
 *   logger.info('Server started', { port: 3000 });
 *
 *   // Module-scoped child logger
 *   const log = createLogger('CustomAPIs');
 *   log.warn('Access denied', { statusCode: 401 });
 *
 *   // Request/response/error helpers
 *   import { logRequest, logResponse, logError } from './utils/logger';
 *   logRequest(log, { method: 'POST', url: '/api/v1/messages', headers: { 'x-tenant-id': '...' } });
 *   logResponse(log, { statusCode: 200, body: { id: '123' } });
 *   logError(log, error, { context: 'token exchange' });
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.createLogger = createLogger;
exports.logRequest = logRequest;
exports.logResponse = logResponse;
exports.logError = logError;
const _config_1 = require("@config");
// ---------------------------------------------------------------------------
// Log levels
// ---------------------------------------------------------------------------
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
function resolveLogLevel() {
    if (_config_1.LOG_LEVEL in LOG_LEVELS)
        return _config_1.LOG_LEVEL;
    return 'info';
}
// ---------------------------------------------------------------------------
// Sensitive header keys to redact
// ---------------------------------------------------------------------------
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-n8n-api-key', 'x-api-key']);
function sanitizeHeaders(headers) {
    if (!headers)
        return undefined;
    const sanitized = {};
    for (const [key, value] of Object.entries(headers)) {
        if (value === undefined)
            continue;
        const lower = key.toLowerCase();
        sanitized[key] = SENSITIVE_HEADERS.has(lower) ? '[REDACTED]' : String(value);
    }
    return sanitized;
}
class StructuredLogger {
    module;
    minLevel;
    constructor(module, minLevel) {
        this.module = module;
        this.minLevel = minLevel ?? LOG_LEVELS[resolveLogLevel()];
    }
    debug(msg, ctx) {
        this.emit('debug', msg, ctx);
    }
    info(msg, ctx) {
        this.emit('info', msg, ctx);
    }
    warn(msg, ctx) {
        this.emit('warn', msg, ctx);
    }
    error(msg, ctx) {
        this.emit('error', msg, ctx);
    }
    /**
     * Create a child logger that inherits the minimum log level and adds a
     * `module` field to every log entry.
     */
    child(module) {
        return new StructuredLogger(module, this.minLevel);
    }
    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------
    emit(level, msg, ctx) {
        if (LOG_LEVELS[level] < this.minLevel)
            return;
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            ...(this.module ? { module: this.module } : {}),
            msg,
            ...ctx,
        };
        switch (level) {
            case 'debug':
                console.debug(JSON.stringify(entry));
                break;
            case 'info':
                console.info(JSON.stringify(entry));
                break;
            case 'warn':
                console.warn(JSON.stringify(entry));
                break;
            case 'error':
                console.error(JSON.stringify(entry));
                break;
        }
    }
}
// ---------------------------------------------------------------------------
// Singleton root logger & factory
// ---------------------------------------------------------------------------
/** Root logger instance (no module context). */
exports.logger = new StructuredLogger();
/** Create a module-scoped child logger. */
function createLogger(module) {
    return exports.logger.child(module);
}
/**
 * Log outgoing or incoming request details at `debug` level.
 * Headers are automatically sanitized (Authorization, API keys redacted).
 */
function logRequest(log, req, extra) {
    log.debug('request', {
        method: req.method,
        url: req.url,
        headers: sanitizeHeaders(req.headers),
        ...(req.body !== undefined ? { body: req.body } : {}),
        ...extra,
    });
}
/**
 * Log response details at `debug` level (or `warn` for 4xx/5xx).
 */
function logResponse(log, res, extra) {
    const statusCode = res.statusCode ?? 0;
    const level = statusCode >= 400 ? 'warn' : 'debug';
    const ctx = {
        statusCode,
        ...(res.headers ? { headers: sanitizeHeaders(res.headers) } : {}),
        ...(res.body !== undefined ? { body: res.body } : {}),
        ...(res.durationMs !== undefined ? { durationMs: res.durationMs } : {}),
        ...extra,
    };
    log[level]('response', ctx);
}
/**
 * Log an error with full context at `error` level.
 * Extracts message, stack, code, and any additional context supplied.
 */
function logError(log, error, extra) {
    const err = error instanceof Error ? error : new Error(String(error));
    const ctx = {
        error: err.message,
        ...(err.stack ? { stack: err.stack } : {}),
        ...(err.code ? { code: err.code } : {}),
        ...extra,
    };
    log.error('error', ctx);
}
