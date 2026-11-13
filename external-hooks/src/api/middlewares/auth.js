'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createAuthMiddleware = createAuthMiddleware;
const headers_1 = require('../constants/headers');
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const log = (0, logger_1.createLogger)('CustomAPIs');
/** Runs a middleware and completes when it calls `next()` or `next(err)`. */
function runMiddleware(mw, req, res) {
  return new Promise((resolve, reject) => {
    const done = (err) => {
      if (err) reject(err);
      else resolve();
    };
    void Promise.resolve(mw(req, res, done)).catch(reject);
  });
}
function createAuthMiddleware(config) {
  const { userRepository, globalOwnerRoleSlug, globalAdminRoleSlug } = config;
  /** Validates X-N8N-API-KEY and hydrates `res.locals.caller` for downstream handlers. */
  const apiKeyAuthMiddleware = async (req, res, next) => {
    try {
      const token = req.header(headers_1.N8N_API_KEY_HEADER);
      if (!token) {
        log.warn('Access denied: No API key provided', { statusCode: 401 });
        return next(new errors_1.AppError(401, 'No API key provided'));
      }
      const caller = await userRepository.getUserForApiKey(token);
      if (!caller || caller.disabled) {
        log.warn('Rejecting: missing caller or disabled', { handler: 'apiKeyAuth' });
        return next(new errors_1.AppError(401, 'Invalid API key'));
      }
      res.locals.caller = caller;
      next();
    } catch (error) {
      log.warn('Invalid API key', { statusCode: 401, error: error.message });
      log.debug('apiKeyAuth stack trace', { stack: error.stack });
      return next(new errors_1.AppError(401, 'Invalid API key'));
    }
  };
  /** Admin-only guard layered on top of api-key auth (global owner/admin role slugs only). */
  const adminAuthMiddleware = async (req, res, next) => {
    try {
      await runMiddleware(apiKeyAuthMiddleware, req, res);
    } catch (err) {
      return next(err);
    }
    if (!res.locals.caller) {
      log.warn('No caller after apiKeyAuth - stopping', { handler: 'adminAuth', statusCode: 401 });
      return next(new errors_1.AppError(401, 'Invalid API key'));
    }
    const slug = res.locals.caller.role?.slug;
    const allowed = [globalOwnerRoleSlug, globalAdminRoleSlug];
    const isGlobalAdmin = slug !== undefined && allowed.includes(slug);
    if (!isGlobalAdmin) {
      log.warn('Forbidden: caller lacks Admin/Owner privileges', {
        statusCode: 403,
        email: res.locals.caller.email,
      });
      return next(new errors_1.AppError(403, 'Global admin access required.'));
    }
    next();
  };
  return { apiKeyAuthMiddleware, adminAuthMiddleware };
}
