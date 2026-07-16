import { AUTHORIZATION_HEADER } from '../constants/headers';
import { extractBearerToken } from '../helpers/bearer';
import type { AuthRequest, AuthResponse, ExpressNext } from '../types/auth';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { INTERNAL_AUTH_TOKEN } from '@config';

const log = createLogger('CustomAPIs');

/**
 * Internal-only bearer auth. Validates `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`
 * and nothing else. Use for endpoints that the n8n runtime itself calls
 * (e.g. node helpers) — no API key or tenant scoping.
 */
export function createInternalBearerMiddleware() {
  return async (req: AuthRequest, _res: AuthResponse, next: ExpressNext) => {
    if (!INTERNAL_AUTH_TOKEN) {
      log.warn('INTERNAL_AUTH_TOKEN not configured', { handler: 'internalBearer', statusCode: 500 });
      return next(new AppError(500, 'INTERNAL_AUTH_TOKEN not configured'));
    }

    const bearerToken = extractBearerToken(req.header(AUTHORIZATION_HEADER));
    if (!bearerToken || bearerToken !== INTERNAL_AUTH_TOKEN) {
      log.warn('Internal bearer auth failed', { handler: 'internalBearer', statusCode: 401 });
      return next(new AppError(401, 'Unauthorized'));
    }

    next();
  };
}
