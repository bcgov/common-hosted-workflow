import { N8N_API_KEY_HEADER } from '../constants/headers';
import type { AuthMiddlewareConfig, AuthRequest, AuthResponse, ExpressNext } from '../types/auth';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('CustomAPIs');

/** Runs a middleware and completes when it calls `next()` or `next(err)`. */
function runMiddleware(
  mw: (req: AuthRequest, res: AuthResponse, next: ExpressNext) => void | Promise<void>,
  req: AuthRequest,
  res: AuthResponse,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done: ExpressNext = (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    };
    void Promise.resolve(mw(req, res, done)).catch(reject);
  });
}

export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  const { services, globalOwnerRoleSlug, globalAdminRoleSlug } = config;

  /** Validates X-N8N-API-KEY and hydrates `res.locals.caller` for downstream handlers. */
  const apiKeyAuthMiddleware = async (req: AuthRequest, res: AuthResponse, next: ExpressNext) => {
    try {
      const token = req.header(N8N_API_KEY_HEADER);

      if (!token) {
        log.warn('Access denied: No API key provided', { statusCode: 401 });
        return next(new AppError(401, 'No API key provided'));
      }

      const caller = await services.apiKey.getUserForApiKey(token);

      if (!caller || caller.disabled) {
        log.warn('Rejecting: missing caller or disabled', { handler: 'apiKeyAuth' });
        return next(new AppError(401, 'Invalid API key'));
      }
      res.locals.caller = caller;
      next();
    } catch (error) {
      log.warn('Invalid API key', { statusCode: 401, error: (error as Error).message });
      log.debug('apiKeyAuth stack trace', { stack: (error as Error).stack });
      return next(new AppError(401, 'Invalid API key'));
    }
  };

  /** Admin-only guard layered on top of api-key auth (global owner/admin role slugs only). */
  const adminAuthMiddleware = async (req: AuthRequest, res: AuthResponse, next: ExpressNext) => {
    try {
      await runMiddleware(apiKeyAuthMiddleware, req, res);
    } catch (err) {
      return next(err);
    }

    if (!res.locals.caller) {
      log.warn('No caller after apiKeyAuth - stopping', { handler: 'adminAuth', statusCode: 401 });
      return next(new AppError(401, 'Invalid API key'));
    }

    const slug = res.locals.caller.role?.slug;
    const allowed = [globalOwnerRoleSlug, globalAdminRoleSlug];
    const isGlobalAdmin = slug !== undefined && allowed.includes(slug);

    if (!isGlobalAdmin) {
      log.warn('Forbidden: caller lacks Admin/Owner privileges', {
        statusCode: 403,
        email: res.locals.caller.email,
      });
      return next(new AppError(403, 'Global admin access required.'));
    }

    next();
  };

  return { apiKeyAuthMiddleware, adminAuthMiddleware };
}
