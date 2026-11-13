'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createOidcJwtMiddleware = createOidcJwtMiddleware;
const jose_1 = require('jose');
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const log = (0, logger_1.createLogger)('CustomAPIs');
function extractBearerToken(req) {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
function toAudienceArray(audience) {
  if (!audience) return [];
  return Array.isArray(audience) ? audience : [audience];
}
function getClaimAsString(claim) {
  return typeof claim === 'string' ? claim : undefined;
}
function createOidcJwtMiddleware(config) {
  if (!config.issuer || !config.jwksUri) {
    return (_req, _res, next) => {
      next(new errors_1.AppError(503, 'OIDC JWT validation is not configured'));
    };
  }
  const jwks = (0, jose_1.createRemoteJWKSet)(new URL(config.jwksUri));
  return async (req, res, next) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        return next(new errors_1.AppError(401, 'Missing bearer token'));
      }
      const verification = await (0, jose_1.jwtVerify)(token, jwks, {
        issuer: config.issuer,
        audience: config.expectedAudience,
      });
      const claims = verification.payload;
      const azp = getClaimAsString(claims.azp);
      if (config.expectedAzp && azp !== config.expectedAzp) {
        return next(new errors_1.AppError(403, 'Invalid token audience'));
      }
      const subject = getClaimAsString(claims.sub);
      if (!subject) {
        return next(new errors_1.AppError(401, 'Missing token subject'));
      }
      const details = {
        token,
        header: verification.protectedHeader,
        claims,
        issuer: getClaimAsString(claims.iss) ?? config.issuer,
        subject,
        audience: toAudienceArray(claims.aud),
        azp,
        email: getClaimAsString(claims.email),
        preferredUsername: getClaimAsString(claims.preferred_username),
        name: getClaimAsString(claims.name),
        scope: getClaimAsString(claims.scope),
        expiresAt: claims.exp,
        issuedAt: claims.iat,
        notBefore: claims.nbf,
      };
      res.locals.oidcToken = token;
      res.locals.oidcTokenDetails = details;
      next();
    } catch (error) {
      log.warn('OIDC token validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      next(new errors_1.AppError(401, 'Invalid OIDC token'));
    }
  };
}
