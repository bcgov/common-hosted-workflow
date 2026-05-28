import { createHash, randomBytes } from 'crypto';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { deleteUiOidcState, getUiOidcState, setUiOidcState } from './ui-oidc-store';
import { getOidcConfigFromEnv, type OidcDiscoveryDocument, type UiOidcConfig } from './ui-oidc';
import { logger } from '../utils/logger';

const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OIDC_DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000;

let oidcDiscoveryCache: OidcDiscoveryDocument | null = null;
let oidcDiscoveryCacheTime = 0;

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

function toBase64Url(value: Buffer) {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createCodeChallenge(codeVerifier: string) {
  return toBase64Url(createHash('sha256').update(codeVerifier).digest());
}

async function fetchDiscoveryDocument(config: UiOidcConfig = getOidcConfigFromEnv()) {
  if (!config.issuerUrl) {
    return {
      issuer: config.issuerUrl,
      authorization_endpoint: config.authorizationEndpoint,
      token_endpoint: config.tokenEndpoint,
      userinfo_endpoint: config.userinfoEndpoint,
      jwks_uri: config.jwksUri,
    } satisfies OidcDiscoveryDocument;
  }

  const now = Date.now();
  if (oidcDiscoveryCache && now - oidcDiscoveryCacheTime < OIDC_DISCOVERY_CACHE_TTL_MS) {
    return oidcDiscoveryCache;
  }

  const response = await fetch(`${config.issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC discovery document: ${response.status}`);
  }

  oidcDiscoveryCache = (await response.json()) as OidcDiscoveryDocument;
  oidcDiscoveryCacheTime = now;
  return oidcDiscoveryCache;
}

async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  discovery: OidcDiscoveryDocument,
  config: UiOidcConfig = getOidcConfigFromEnv(),
) {
  const tokenEndpoint = discovery.token_endpoint || config.tokenEndpoint;
  if (!tokenEndpoint) {
    throw new Error('OIDC token endpoint is not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return (await response.json()) as {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

async function verifyIdToken(
  idToken: string,
  discovery: OidcDiscoveryDocument,
  clientId: string,
  expectedNonce: string,
) {
  const jwksUri = discovery.jwks_uri;
  if (!jwksUri) {
    throw new Error('OIDC JWKS endpoint is not configured');
  }

  const issuer = discovery.issuer || getOidcConfigFromEnv().issuerUrl;
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  const verification = await jwtVerify(idToken, jwks, {
    issuer,
    audience: clientId,
  });

  const claims = verification.payload as Record<string, unknown>;
  if (typeof claims.nonce !== 'string' || claims.nonce !== expectedNonce) {
    throw new Error('Invalid nonce');
  }

  return claims;
}

async function fetchUserInfo(
  accessToken: string,
  discovery: OidcDiscoveryDocument,
  config: UiOidcConfig = getOidcConfigFromEnv(),
) {
  const userinfoEndpoint = discovery.userinfo_endpoint || config.userinfoEndpoint;
  if (!userinfoEndpoint) {
    return null;
  }

  const response = await fetch(userinfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function buildUiLoginRedirect(req: Request) {
  const config = getOidcConfigFromEnv();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('OIDC configuration error');
  }

  const discovery = await fetchDiscoveryDocument(config);
  const authorizationEndpoint = discovery.authorization_endpoint || config.authorizationEndpoint;
  if (!authorizationEndpoint) {
    throw new Error('OIDC authorization endpoint is not configured');
  }

  const state = randomBytes(32).toString('hex');
  const nonce = randomBytes(32).toString('hex');
  const codeVerifier = toBase64Url(randomBytes(32));
  const redirectUri = config.redirectUri || `${getRequestOrigin(req)}/ui-api/auth/callback`;
  const returnTo = normalizeReturnTo(req.query.returnTo, '/ui/', getAllowedReturnToOrigins(req, config));

  await setUiOidcState(
    state,
    {
      nonce,
      codeVerifier,
      returnTo,
      redirectUri,
    },
    AUTH_STATE_TTL_MS,
  );

  logger.info('Redirecting to OIDC provider', { authorizationEndpoint, returnTo });

  const authUrl = new URL(authorizationEndpoint);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scopes);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('nonce', nonce);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', createCodeChallenge(codeVerifier));

  return authUrl.toString();
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

  const discovery = await fetchDiscoveryDocument(config);
  const tokens = await exchangeAuthorizationCode(code, entry.codeVerifier, entry.redirectUri, discovery, config);

  let claims: Record<string, unknown> | null = null;
  if (tokens.id_token) {
    claims = await verifyIdToken(tokens.id_token, discovery, config.clientId, entry.nonce);
  }

  const userInfo = tokens.access_token ? await fetchUserInfo(tokens.access_token, discovery, config) : null;
  const mergedClaims = { ...(claims ?? {}), ...(userInfo ?? {}) };

  const email =
    (typeof mergedClaims.email === 'string' && mergedClaims.email) ||
    (typeof mergedClaims.preferred_username === 'string' && mergedClaims.preferred_username) ||
    null;

  if (!email) {
    return { ok: false, returnTo, errorMessage: 'No valid email in OIDC response' } as const;
  }

  return {
    ok: true,
    returnTo,
    subject: typeof mergedClaims.sub === 'string' ? mergedClaims.sub : email,
    email,
    preferredUsername:
      typeof mergedClaims.preferred_username === 'string' ? mergedClaims.preferred_username : undefined,
    name: typeof mergedClaims.name === 'string' ? mergedClaims.name : undefined,
    issuer: typeof mergedClaims.iss === 'string' ? mergedClaims.iss : discovery.issuer || config.issuerUrl,
    audience: Array.isArray(mergedClaims.aud)
      ? mergedClaims.aud.filter((value): value is string => typeof value === 'string')
      : typeof mergedClaims.aud === 'string'
        ? [mergedClaims.aud]
        : [],
    claims: mergedClaims,
  } as const;
}
