'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.clearJwksCacheForTests = clearJwksCacheForTests;
exports.getJwksCacheSizeForTests = getJwksCacheSizeForTests;
exports.getJwksCacheKeysForTests = getJwksCacheKeysForTests;
exports.clearOidcDiscoveryCache = clearOidcDiscoveryCache;
exports.fetchWithTimeout = fetchWithTimeout;
exports.getOidcProviderTimeoutMsForTests = getOidcProviderTimeoutMsForTests;
exports.fetchOidcDiscoveryDocument = fetchOidcDiscoveryDocument;
exports.createOidcCodeVerifier = createOidcCodeVerifier;
exports.createOidcCodeChallenge = createOidcCodeChallenge;
exports.createOidcRandomString = createOidcRandomString;
exports.buildOidcAuthorizationUrl = buildOidcAuthorizationUrl;
exports.beginOidcAuthorization = beginOidcAuthorization;
exports.exchangeAuthorizationCode = exchangeAuthorizationCode;
exports.refreshOidcTokens = refreshOidcTokens;
exports.fetchOidcUserInfo = fetchOidcUserInfo;
exports.completeOidcAuthorization = completeOidcAuthorization;
exports.decodeOidcJwt = decodeOidcJwt;
exports.extractOidcIdentity = extractOidcIdentity;
const node_crypto_1 = require('node:crypto');
const jose_1 = require('jose');
const _config_1 = require('@config');
const discoveryCache = new Map();
const OIDC_DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000;
// Remote JWKS resolver reuse — one instance per trusted JWKS URI.
// `jose`'s RemoteJWKSet internally respects Cache-Control / key rotation
// (re-fetches when `kid` not found / on expiry), so reusing the instance
// preserves rotation while avoiding per-verification construction and
// redundant network work.
// Exported helpers for tests: `clearJwksCacheForTests`, `getJwksCacheSizeForTests`.
const jwksCache = new Map();
function getRemoteJWKSet(jwksUri) {
  let entry = jwksCache.get(jwksUri);
  if (!entry) {
    entry = (0, jose_1.createRemoteJWKSet)(new URL(jwksUri));
    jwksCache.set(jwksUri, entry);
  }
  return entry;
}
function clearJwksCacheForTests() {
  jwksCache.clear();
}
function getJwksCacheSizeForTests() {
  return jwksCache.size;
}
function getJwksCacheKeysForTests() {
  return [...jwksCache.keys()];
}
function clearOidcDiscoveryCache() {
  discoveryCache.clear();
}
// Bounded provider fetch with stable timeout handling.
// All OIDC provider network calls (discovery, token, refresh, userinfo)
// go through this helper. It aborts after `timeoutMs` and throws the
// stable message `OIDC provider request timed out` so callers and
// tests can assert upper time bounds without depending on fetch
// implementation details or raw AbortError text.
async function fetchWithTimeout(input, init = {}, timeoutMs = _config_1.OIDC_PROVIDER_TIMEOUT_MS) {
  // Allow tests to disable timeout with 0 or negative
  if (!timeoutMs || timeoutMs <= 0) {
    return fetch(input, init);
  }
  const controller = new AbortController();
  // Merge caller signal with timeout signal when possible (Node 20+ has AbortSignal.any)
  let signal = controller.signal;
  if (init.signal) {
    const anyFn = AbortSignal.any;
    if (typeof anyFn === 'function') {
      signal = anyFn([init.signal, controller.signal]);
    } else {
      // Fallback: honour caller abort separately, timeout still aborts its own controller
      // Caller aborts will not be merged, but no caller currently passes a signal.
      signal = controller.signal;
      if (init.signal.aborted) controller.abort();
      else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal });
    return response;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('OIDC provider request timed out', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function getOidcProviderTimeoutMsForTests() {
  return _config_1.OIDC_PROVIDER_TIMEOUT_MS;
}
function getDiscoveryCacheKey(config) {
  return [
    config.issuerUrl,
    config.authorizationEndpoint,
    config.tokenEndpoint,
    config.userinfoEndpoint,
    config.jwksUri,
    config.clientId,
    config.redirectUri,
  ].join('|');
}
async function fetchOidcDiscoveryDocument(config) {
  if (!config.issuerUrl) {
    throw new Error('OIDC issuer is required in manual endpoint mode');
  }
  // A container may need internal provider endpoints while the issuer remains
  // browser-facing. When every endpoint is explicitly configured, discovery
  // would incorrectly try to reach that browser address from the container.
  if (
    config.useManualEndpoints &&
    config.authorizationEndpoint &&
    config.tokenEndpoint &&
    config.userinfoEndpoint &&
    config.jwksUri
  ) {
    return {
      issuer: config.issuerUrl,
      authorization_endpoint: config.authorizationEndpoint,
      token_endpoint: config.tokenEndpoint,
      userinfo_endpoint: config.userinfoEndpoint,
      jwks_uri: config.jwksUri,
      end_session_endpoint: config.endSessionEndpoint || undefined,
    };
  }
  const cacheKey = getDiscoveryCacheKey(config);
  const now = Date.now();
  const cached = discoveryCache.get(cacheKey);
  if (cached && now - cached.cachedAt < OIDC_DISCOVERY_CACHE_TTL_MS) {
    return cached.document;
  }
  const issuerUrl = config.issuerUrl.endsWith('/') ? config.issuerUrl.slice(0, -1) : config.issuerUrl;
  const response = await fetchWithTimeout(`${issuerUrl}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC discovery document: ${response.status}`);
  }
  const document = await response.json();
  discoveryCache.set(cacheKey, { document, cachedAt: now });
  return document;
}
function toBase64Url(value) {
  let encoded = value.toString('base64').replaceAll('+', '-').replaceAll('/', '_');
  while (encoded.endsWith('=')) {
    encoded = encoded.slice(0, -1);
  }
  return encoded;
}
function createOidcCodeVerifier() {
  return toBase64Url((0, node_crypto_1.randomBytes)(32));
}
function createOidcCodeChallenge(codeVerifier) {
  return toBase64Url((0, node_crypto_1.createHash)('sha256').update(codeVerifier).digest());
}
function createOidcRandomString(length = 32) {
  return (0, node_crypto_1.randomBytes)(length).toString('hex');
}
function buildOidcAuthorizationUrl(params) {
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
async function beginOidcAuthorization(params) {
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
  };
}
async function exchangeAuthorizationCode(params) {
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
  const response = await fetchWithTimeout(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }
  return await response.json();
}
async function refreshOidcTokens(params) {
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
  const response = await fetchWithTimeout(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }
  return await response.json();
}
function resolveOidcIssuer(config, discovery) {
  const configured = config.issuerUrl?.trim() || undefined;
  const discovered = discovery.issuer?.trim() || undefined;
  if (configured && discovered && configured !== discovered) {
    throw new Error(`OIDC discovery issuer mismatch: expected ${configured} got ${discovered}`);
  }
  return discovered || configured || undefined;
}
async function verifyOidcIdToken(params) {
  const jwksUri = params.discovery.jwks_uri || params.config.jwksUri;
  if (!jwksUri) {
    throw new Error('OIDC JWKS URI is not configured');
  }
  const issuer = resolveOidcIssuer(params.config, params.discovery);
  if (!issuer) {
    throw new Error('OIDC issuer is not configured');
  }
  const jwks = getRemoteJWKSet(jwksUri);
  const verifyOpts = {
    issuer,
    audience: params.config.clientId,
  };
  const verification = await (0, jose_1.jwtVerify)(params.idToken, jwks, verifyOpts);
  const claims = verification.payload;
  if (typeof claims.nonce !== 'string' || claims.nonce !== params.expectedNonce) {
    throw new Error('Invalid nonce');
  }
  return claims;
}
async function fetchOidcUserInfo(params) {
  const userinfoEndpoint = params.discovery.userinfo_endpoint || params.config.userinfoEndpoint;
  if (!userinfoEndpoint) {
    return null;
  }
  const response = await fetchWithTimeout(userinfoEndpoint, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  if (!response.ok) {
    return null;
  }
  return await response.json();
}
async function completeOidcAuthorization(params) {
  const discovery = await fetchOidcDiscoveryDocument(params.config);
  // Validate discovered issuer exactly against configured issuer before any token handling.
  resolveOidcIssuer(params.config, discovery);
  const tokens = await exchangeAuthorizationCode({
    code: params.code,
    discovery,
    config: params.config,
    redirectUri: params.storedState.redirectUri,
    codeVerifier: params.storedState.codeVerifier,
  });
  if (!tokens.id_token) {
    throw new Error('Missing ID token in token response');
  }
  const idTokenClaims = await verifyOidcIdToken({
    idToken: tokens.id_token,
    discovery,
    config: params.config,
    expectedNonce: params.storedState.nonce,
  });
  if (typeof idTokenClaims.sub !== 'string' || !idTokenClaims.sub) {
    throw new Error('Invalid ID token: missing sub');
  }
  const userInfo = tokens.access_token
    ? await fetchOidcUserInfo({
        accessToken: tokens.access_token,
        discovery,
        config: params.config,
      })
    : null;
  if (userInfo) {
    if (typeof userInfo.sub !== 'string' || !userInfo.sub) {
      throw new Error('Invalid userinfo: missing sub');
    }
    if (userInfo.sub !== idTokenClaims.sub) {
      throw new Error('userinfo sub mismatch');
    }
  }
  // Authoritative claim sources (explicit merging — no silent spread overwrite):
  // - sub: verified ID token only
  // - email: verified ID token if present, otherwise verified userinfo (same subject)
  // - roles / authorization claim: verified ID token if present, otherwise userinfo
  // - iss/aud/nonce/exp/iat/nbf/jti: verified ID token only
  // - other profile claims: ID token preferred, userinfo supplements without overwriting
  const mergedClaims = { ...idTokenClaims };
  if (userInfo) {
    const protectedKeys = new Set([
      'sub',
      'iss',
      'aud',
      'nonce',
      'exp',
      'iat',
      'nbf',
      'jti',
      'at_hash',
      'c_hash',
      'azp',
    ]);
    for (const [key, value] of Object.entries(userInfo)) {
      if (protectedKeys.has(key)) continue;
      // Email and roles are authoritative from ID token if already present.
      if (
        (key === 'email' || key === 'preferred_username') &&
        typeof mergedClaims[key] === 'string' &&
        mergedClaims[key]
      ) {
        continue;
      }
      if (key in mergedClaims) continue;
      mergedClaims[key] = value;
    }
    // Ensure email from userinfo is used if ID token lacks it (subject already verified equal).
    if (!mergedClaims.email && typeof userInfo.email === 'string' && userInfo.email) {
      mergedClaims.email = userInfo.email;
    }
    if (!mergedClaims.preferred_username && typeof userInfo.preferred_username === 'string') {
      mergedClaims.preferred_username = userInfo.preferred_username;
    }
  }
  return {
    discovery,
    tokens,
    idTokenClaims,
    userInfo,
    mergedClaims,
  };
}
function decodeOidcJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  let base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}
function extractOidcIdentity(params) {
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
      ? params.claims.aud.filter((value) => typeof value === 'string')
      : typeof params.claims.aud === 'string'
        ? [params.claims.aud]
        : [],
    claims: params.claims,
  };
}
