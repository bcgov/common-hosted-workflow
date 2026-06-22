import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { OidcDiscoveryDocument, UiOidcConfig } from './ui-oidc';

export type OidcProviderConfig = Pick<
  UiOidcConfig,
  | 'issuerUrl'
  | 'authorizationEndpoint'
  | 'tokenEndpoint'
  | 'userinfoEndpoint'
  | 'jwksUri'
  | 'clientId'
  | 'clientSecret'
  | 'redirectUri'
  | 'scopes'
>;

export type OidcAuthorizationState = {
  nonce: string;
  codeVerifier?: string;
  redirectUri: string;
};

export type OidcAuthorizationRequest = OidcAuthorizationState & {
  state: string;
  authorizationUrl: string;
};

export type OidcAuthorizationResult = {
  discovery: OidcDiscoveryDocument;
  tokens: {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  idTokenClaims: Record<string, unknown> | null;
  userInfo: Record<string, unknown> | null;
  mergedClaims: Record<string, unknown>;
};

export type OidcIdentity = {
  subject: string;
  email: string | null;
  preferredUsername?: string;
  name?: string;
  issuer: string;
  audience: string[];
  claims: Record<string, unknown>;
};

type OidcDiscoveryCacheEntry = {
  document: OidcDiscoveryDocument;
  cachedAt: number;
};

const discoveryCache = new Map<string, OidcDiscoveryCacheEntry>();
const OIDC_DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000;

function getDiscoveryCacheKey(config: OidcProviderConfig) {
  return [
    config.issuerUrl,
    config.authorizationEndpoint,
    config.tokenEndpoint,
    config.userinfoEndpoint,
    config.clientId,
    config.redirectUri,
  ].join('|');
}

export async function fetchOidcDiscoveryDocument(config: OidcProviderConfig) {
  if (!config.issuerUrl) {
    return {
      issuer: config.issuerUrl,
      authorization_endpoint: config.authorizationEndpoint,
      token_endpoint: config.tokenEndpoint,
      userinfo_endpoint: config.userinfoEndpoint,
    } satisfies OidcDiscoveryDocument;
  }

  const cacheKey = getDiscoveryCacheKey(config);
  const now = Date.now();
  const cached = discoveryCache.get(cacheKey);
  if (cached && now - cached.cachedAt < OIDC_DISCOVERY_CACHE_TTL_MS) {
    return cached.document;
  }

  const issuerUrl = config.issuerUrl.endsWith('/') ? config.issuerUrl.slice(0, -1) : config.issuerUrl;
  const response = await fetch(`${issuerUrl}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC discovery document: ${response.status}`);
  }

  const document = (await response.json()) as OidcDiscoveryDocument;
  discoveryCache.set(cacheKey, { document, cachedAt: now });
  return document;
}

function toBase64Url(value: Buffer) {
  let encoded = value.toString('base64').replaceAll('+', '-').replaceAll('/', '_');
  while (encoded.endsWith('=')) {
    encoded = encoded.slice(0, -1);
  }
  return encoded;
}

export function createOidcCodeVerifier() {
  return toBase64Url(randomBytes(32));
}

export function createOidcCodeChallenge(codeVerifier: string) {
  return toBase64Url(createHash('sha256').update(codeVerifier).digest());
}

export function createOidcRandomString(length = 32) {
  return randomBytes(length).toString('hex');
}

export function buildOidcAuthorizationUrl(params: {
  discovery: OidcDiscoveryDocument;
  config: OidcProviderConfig;
  redirectUri?: string;
  state: string;
  nonce: string;
  codeChallenge?: string;
}) {
  const authorizationEndpoint = params.discovery.authorization_endpoint || params.config.authorizationEndpoint;
  if (!authorizationEndpoint) {
    throw new Error('OIDC authorization endpoint is not configured');
  }

  const authUrl = new URL(authorizationEndpoint);
  authUrl.searchParams.set('client_id', params.config.clientId);
  authUrl.searchParams.set('redirect_uri', params.redirectUri || params.config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', params.config.scopes);
  authUrl.searchParams.set('state', params.state);
  authUrl.searchParams.set('nonce', params.nonce);

  if (params.codeChallenge) {
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', params.codeChallenge);
  }

  return authUrl.toString();
}

export async function beginOidcAuthorization(params: {
  config: OidcProviderConfig;
  redirectUri?: string;
  usePkce?: boolean;
}) {
  const discovery = await fetchOidcDiscoveryDocument(params.config);
  const state = createOidcRandomString();
  const nonce = createOidcRandomString();
  const redirectUri = params.redirectUri || params.config.redirectUri;
  const codeVerifier = params.usePkce === false ? undefined : createOidcCodeVerifier();

  return {
    state,
    nonce,
    codeVerifier,
    redirectUri,
    authorizationUrl: buildOidcAuthorizationUrl({
      discovery,
      config: params.config,
      redirectUri,
      state,
      nonce,
      codeChallenge: codeVerifier ? createOidcCodeChallenge(codeVerifier) : undefined,
    }),
  } satisfies OidcAuthorizationRequest;
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  discovery: OidcDiscoveryDocument;
  config: OidcProviderConfig;
  redirectUri: string;
  codeVerifier?: string;
}) {
  const tokenEndpoint = params.discovery.token_endpoint || params.config.tokenEndpoint;
  if (!tokenEndpoint) {
    throw new Error('OIDC token endpoint is not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.config.clientId,
    client_secret: params.config.clientSecret,
  });

  if (params.codeVerifier) {
    body.set('code_verifier', params.codeVerifier);
  }

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

export async function refreshOidcTokens(params: {
  refreshToken: string;
  discovery: OidcDiscoveryDocument;
  config: OidcProviderConfig;
}) {
  const tokenEndpoint = params.discovery.token_endpoint || params.config.tokenEndpoint;
  if (!tokenEndpoint) {
    throw new Error('OIDC token endpoint is not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.config.clientId,
    client_secret: params.config.clientSecret,
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return (await response.json()) as {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

async function verifyOidcIdToken(params: {
  idToken: string;
  discovery: OidcDiscoveryDocument;
  config: OidcProviderConfig;
  expectedNonce: string;
}) {
  const jwksUri = params.discovery.jwks_uri || params.config.jwksUri;
  if (!jwksUri) {
    const claims = decodeOidcJwt(params.idToken);
    if (typeof claims.nonce !== 'string' || claims.nonce !== params.expectedNonce) {
      throw new Error('Invalid nonce');
    }
    return claims;
  }

  const issuer = params.discovery.issuer || params.config.issuerUrl;
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  const verification = await jwtVerify(params.idToken, jwks, {
    issuer,
    audience: params.config.clientId,
  });

  const claims = verification.payload as Record<string, unknown>;
  if (typeof claims.nonce !== 'string' || claims.nonce !== params.expectedNonce) {
    throw new Error('Invalid nonce');
  }

  return claims;
}

export async function fetchOidcUserInfo(params: {
  accessToken: string;
  discovery: OidcDiscoveryDocument;
  config: OidcProviderConfig;
}) {
  const userinfoEndpoint = params.discovery.userinfo_endpoint || params.config.userinfoEndpoint;
  if (!userinfoEndpoint) {
    return null;
  }

  const response = await fetch(userinfoEndpoint, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function completeOidcAuthorization(params: {
  code: string;
  storedState: OidcAuthorizationState;
  config: OidcProviderConfig;
}) {
  const discovery = await fetchOidcDiscoveryDocument(params.config);
  const tokens = await exchangeAuthorizationCode({
    code: params.code,
    discovery,
    config: params.config,
    redirectUri: params.storedState.redirectUri,
    codeVerifier: params.storedState.codeVerifier,
  });

  const idTokenClaims = tokens.id_token
    ? await verifyOidcIdToken({
        idToken: tokens.id_token,
        discovery,
        config: params.config,
        expectedNonce: params.storedState.nonce,
      })
    : null;

  const userInfo = tokens.access_token
    ? await fetchOidcUserInfo({
        accessToken: tokens.access_token,
        discovery,
        config: params.config,
      })
    : null;

  return {
    discovery,
    tokens,
    idTokenClaims,
    userInfo,
    mergedClaims: { ...(idTokenClaims ?? {}), ...(userInfo ?? {}) },
  } satisfies OidcAuthorizationResult;
}

export function decodeOidcJwt(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  let base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
  while (base64.length % 4) {
    base64 += '=';
  }

  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>;
}

export function extractOidcIdentity(params: {
  claims: Record<string, unknown>;
  discovery?: OidcDiscoveryDocument;
  config: OidcProviderConfig;
}) {
  return {
    subject:
      typeof params.claims.sub === 'string'
        ? params.claims.sub
        : typeof params.claims.email === 'string'
          ? params.claims.email
          : '',
    email:
      (typeof params.claims.email === 'string' && params.claims.email) ||
      (typeof params.claims.preferred_username === 'string' && params.claims.preferred_username) ||
      null,
    preferredUsername:
      typeof params.claims.preferred_username === 'string' ? params.claims.preferred_username : undefined,
    name: typeof params.claims.name === 'string' ? params.claims.name : undefined,
    issuer:
      typeof params.claims.iss === 'string' ? params.claims.iss : params.discovery?.issuer || params.config.issuerUrl,
    audience: Array.isArray(params.claims.aud)
      ? params.claims.aud.filter((value): value is string => typeof value === 'string')
      : typeof params.claims.aud === 'string'
        ? [params.claims.aud]
        : [],
    claims: params.claims,
  } satisfies OidcIdentity;
}
