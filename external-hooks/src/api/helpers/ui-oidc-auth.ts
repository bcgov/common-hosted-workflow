import type { Request } from 'express';
import { deleteUiOidcState, getUiOidcState, setUiOidcState } from './ui-oidc-store';
import { getOidcConfigFromEnv, type UiOidcConfig } from './ui-oidc';
import { beginOidcAuthorization, completeOidcAuthorization, extractOidcIdentity } from './oidc-provider';
import { logger } from '../utils/logger';

const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getRequestOrigin(req: Request) {
  return req.get('origin') ?? `${req.protocol}://${req.get('host')}`;
}

function getAllowedReturnToOrigins(req: Request, config: UiOidcConfig) {
  const origins = new Set<string>([getRequestOrigin(req)]);

  if (config.redirectUri) {
    try {
      origins.add(new URL(config.redirectUri).origin);
    } catch {
      // Ignore relative or invalid redirect URIs here and fall back to the request origin.
    }
  }

  return origins;
}

function normalizeReturnTo(value: unknown, fallback: string, allowedOrigins: Set<string>) {
  if (typeof value !== 'string' || !value) return fallback;
  if (value.startsWith('/')) return value;

  try {
    const url = new URL(value);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && allowedOrigins.has(url.origin)) {
      return url.toString();
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export async function buildUiLoginRedirect(req: Request) {
  const config = getOidcConfigFromEnv();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('OIDC configuration error');
  }

  logger.info('Initiating OIDC login flow', { returnTo: req.query.returnTo, redirectUri: config.redirectUri });

  const redirectUri = config.redirectUri || `${getRequestOrigin(req)}/ui-api/auth/callback`;
  const returnTo = normalizeReturnTo(req.query.returnTo, '/ui/', getAllowedReturnToOrigins(req, config));
  const authRequest = await beginOidcAuthorization({
    config,
    redirectUri,
    usePkce: true,
  });

  await setUiOidcState(
    authRequest.state,
    {
      nonce: authRequest.nonce,
      codeVerifier: authRequest.codeVerifier || '',
      returnTo,
      redirectUri: authRequest.redirectUri,
    },
    AUTH_STATE_TTL_MS,
  );

  logger.info('Redirecting to OIDC provider', { returnTo });

  return authRequest.authorizationUrl;
}

export async function completeUiLogin(req: Request) {
  const config = getOidcConfigFromEnv();
  const error = typeof req.query.error === 'string' ? req.query.error : null;
  const errorDescription = typeof req.query.error_description === 'string' ? req.query.error_description : null;
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;

  const entry = state ? await getUiOidcState(state) : null;
  if (state) {
    await deleteUiOidcState(state);
  }

  const returnTo = entry?.returnTo || '/ui/';

  if (error) {
    return { ok: false, returnTo, errorMessage: errorDescription || error } as const;
  }

  if (!code || !state || !entry) {
    return { ok: false, returnTo, errorMessage: 'Missing authorization code or state' } as const;
  }

  const completion = await completeOidcAuthorization({
    code,
    storedState: {
      nonce: entry.nonce,
      codeVerifier: entry.codeVerifier,
      redirectUri: entry.redirectUri,
    },
    config,
  });

  const identity = extractOidcIdentity({
    claims: completion.mergedClaims,
    discovery: completion.discovery,
    config,
  });

  if (!identity.email) {
    return { ok: false, returnTo, errorMessage: 'No valid email in OIDC response' } as const;
  }

  return {
    ok: true,
    returnTo,
    subject: identity.subject,
    email: identity.email,
    preferredUsername: identity.preferredUsername,
    name: identity.name,
    issuer: identity.issuer,
    audience: identity.audience,
    claims: identity.claims,
  } as const;
}
