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

// ---------------------------------------------------------------------------
// Log levels
// ---------------------------------------------------------------------------

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

function resolveLogLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (env in LOG_LEVELS) return env as LogLevel;
  return 'info';
}

// ---------------------------------------------------------------------------
// Sensitive header keys to redact
// ---------------------------------------------------------------------------

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-n8n-api-key', 'x-api-key']);

function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    sanitized[key] = SENSITIVE_HEADERS.has(lower) ? '[REDACTED]' : String(value);
  }
  return sanitized;
}

// ---------------------------------------------------------------------------
// Logger class
// ---------------------------------------------------------------------------

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  child(module: string): Logger;
}

class StructuredLogger implements Logger {
  private readonly module: string | undefined;
  private readonly minLevel: number;

  constructor(module?: string, minLevel?: number) {
    this.module = module;
    this.minLevel = minLevel ?? LOG_LEVELS[resolveLogLevel()];
  }

  debug(msg: string, ctx?: LogContext): void {
    this.emit('debug', msg, ctx);
  }

  info(msg: string, ctx?: LogContext): void {
    this.emit('info', msg, ctx);
  }

  warn(msg: string, ctx?: LogContext): void {
    this.emit('warn', msg, ctx);
  }

  error(msg: string, ctx?: LogContext): void {
    this.emit('error', msg, ctx);
  }

  /**
   * Create a child logger that inherits the minimum log level and adds a
   * `module` field to every log entry.
   */
  child(module: string): Logger {
    return new StructuredLogger(module, this.minLevel);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private emit(level: LogLevel, msg: string, ctx?: LogContext): void {
    if (LOG_LEVELS[level] < this.minLevel) return;

    const entry: Record<string, unknown> = {
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
export const logger: Logger = new StructuredLogger();

/** Create a module-scoped child logger. */
export function createLogger(module: string): Logger {
  return logger.child(module);
}

// ---------------------------------------------------------------------------
// Request / Response / Error helpers
// ---------------------------------------------------------------------------

export interface RequestDetails {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  /** Optional body summary — callers should take care not to pass raw secrets. */
  body?: unknown;
}

/**
 * Log outgoing or incoming request details at `debug` level.
 * Headers are automatically sanitized (Authorization, API keys redacted).
 */
export function logRequest(log: Logger, req: RequestDetails, extra?: LogContext): void {
  log.debug('request', {
    method: req.method,
    url: req.url,
    headers: sanitizeHeaders(req.headers),
    ...(req.body !== undefined ? { body: req.body } : {}),
    ...extra,
  });
}

export interface ResponseDetails {
  statusCode?: number;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  durationMs?: number;
}

/**
 * Log response details at `debug` level (or `warn` for 4xx/5xx).
 */
export function logResponse(log: Logger, res: ResponseDetails, extra?: LogContext): void {
  const statusCode = res.statusCode ?? 0;
  const level: LogLevel = statusCode >= 400 ? 'warn' : 'debug';
  const ctx: LogContext = {
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
export function logError(log: Logger, error: unknown, extra?: LogContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const ctx: LogContext = {
    error: err.message,
    ...(err.stack ? { stack: err.stack } : {}),
    ...((err as NodeJS.ErrnoException).code ? { code: (err as NodeJS.ErrnoException).code } : {}),
    ...extra,
  };
  log.error('error', ctx);
}
