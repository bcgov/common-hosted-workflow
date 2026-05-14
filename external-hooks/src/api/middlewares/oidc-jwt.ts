import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthRequest, AuthResponse, ExpressNext } from '../types/auth';
import type { OidcTokenDetails } from '../types/oidc';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('CustomAPIs');

export interface OidcJwtMiddlewareConfig {
  issuer: string;
  jwksUri: string;
  expectedAzp?: string;
  expectedAudience?: string;
}

function extractBearerToken(req: AuthRequest) {
  const header = req.header('authorization');
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function toAudienceArray(audience: string | string[] | undefined) {
  if (!audience) return [];
  return Array.isArray(audience) ? audience : [audience];
}

function getClaimAsString(claim: unknown) {
  return typeof claim === 'string' ? claim : undefined;
}

export function createOidcJwtMiddleware(config: OidcJwtMiddlewareConfig) {
  if (!config.issuer || !config.jwksUri) {
    return (_req: AuthRequest, _res: AuthResponse, next: ExpressNext) => {
      next(new AppError(503, 'OIDC JWT validation is not configured'));
    };
  }

  const jwks = createRemoteJWKSet(new URL(config.jwksUri));

  return async (req: AuthRequest, res: AuthResponse, next: ExpressNext) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        return next(new AppError(401, 'Missing bearer token'));
      }

      const verification = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.expectedAudience,
      });

      const claims = verification.payload as OidcTokenDetails['claims'];
      const azp = getClaimAsString(claims.azp);

      if (config.expectedAzp && azp !== config.expectedAzp) {
        return next(new AppError(403, 'Invalid token audience'));
      }

      const subject = getClaimAsString(claims.sub);
      if (!subject) {
        return next(new AppError(401, 'Missing token subject'));
      }

      const details: OidcTokenDetails = {
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
        scope: getClaimAsString((claims as Record<string, unknown>).scope),
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
      next(new AppError(401, 'Invalid OIDC token'));
    }
  };
}
