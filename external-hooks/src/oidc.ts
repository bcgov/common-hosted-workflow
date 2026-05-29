/**
 * n8n External Hooks for OIDC Authentication
 * Based on: https://github.com/cweagans/n8n-oidc
 *
 * This file now only provides the frontend settings hook for OIDC.
 * The login and callback routes live in `external-hooks/src/api/hooks.ts`.
 *
 * Environment Variables Required:
 * - OIDC_ISSUER: The OIDC provider's issuer URL (e.g., https://auth.example.com)
 * - OIDC_CLIENT_ID: OAuth2 client ID
 * - OIDC_CLIENT_SECRET: OAuth2 client secret
 * - OIDC_REDIRECT_URI: The callback URL (e.g., https://n8n.example.com/auth/oidc/callback)
 *
 * Optional:
 * - OIDC_SCOPES: Space-separated list of scopes (default: "openid email profile")
 */

import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { URL, URLSearchParams } from 'url';
import { createLogger, logRequest, logResponse, logError } from './api/utils/logger';
import { getN8nOidcConfigFromEnv, validateN8nOidcConfig } from './api/helpers/n8n-oidc';

const log = createLogger('OIDCHook');

const config = getN8nOidcConfigFromEnv();

// Cache for OIDC discovery document
let discoveryCache = null;
let discoveryCacheTime = 0;
const DISCOVERY_CACHE_TTL = 3600000; // 1 hour

/**
 * Make an HTTP/HTTPS request
 * @param {string} url - The URL to request
 * @param {object} options - Request options
 * @returns {Promise<{statusCode: number, headers: object, body: string}>}
 */
function makeRequest(
  url,
  options?: { method?: string; headers?: any; body?: any },
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: any;
}> {
  const { method = 'GET', headers = {}, body } = options ?? {};
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers,
    };

    logRequest(log, { method, url, headers });
    const startTime = Date.now();

    const req = protocol.request(reqOptions, (res) => {
      let b = '';
      res.on('data', (chunk) => (b += chunk));
      res.on('end', () => {
        logResponse(log, {
          statusCode: res.statusCode,
          durationMs: Date.now() - startTime,
        });
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: b,
        });
      });
    });

    req.on('error', (err) => {
      logError(log, err, { context: 'makeRequest', url, method });
      reject(err);
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Fetch OIDC discovery document
 * @returns {Promise<object>}
 */
async function fetchDiscoveryDocument() {
  if (!config.issuerUrl) {
    return {
      authorization_endpoint: config.authorizationEndpoint,
      token_endpoint: config.tokenEndpoint,
      userinfo_endpoint: config.userinfoEndpoint,
    };
  }

  const now = Date.now();
  if (discoveryCache && now - discoveryCacheTime < DISCOVERY_CACHE_TTL) {
    return discoveryCache;
  }

  const discoveryUrl = config.issuerUrl.replace(/\/$/, '') + '/.well-known/openid-configuration';
  const response = await makeRequest(discoveryUrl);

  if (response.statusCode !== 200) {
    throw new Error(`Failed to fetch OIDC discovery document: ${response.statusCode}`);
  }

  discoveryCache = JSON.parse(response.body);
  discoveryCacheTime = now;
  return discoveryCache;
}

/**
 * Generate a random string for state/nonce
 * @param {number} length
 * @returns {string}
 */
function generateRandomString(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Base64URL encode
 * @param {Buffer|string} input
 * @returns {string}
 */
function base64UrlEncode(input) {
  const base64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64URL decode
 * @param {string} input
 * @returns {Buffer}
 */
function base64UrlDecode(input) {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Decode JWT without verification (for extracting claims)
 * @param {string} token
 * @returns {object}
 */
function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  return payload;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code
 * @param {object} discovery
 * @returns {Promise<object>}
 */
async function exchangeCodeForTokens(code, discovery) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await makeRequest(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (response.statusCode !== 200) {
    log.error('Token exchange failed', { statusCode: response.statusCode });
    throw new Error(`Token exchange failed: ${response.statusCode}`);
  }

  return JSON.parse(response.body);
}

/**
 * Fetch user info from OIDC provider
 * @param {string} accessToken
 * @param {object} discovery
 * @returns {Promise<object>}
 */
async function fetchUserInfo(accessToken, discovery) {
  const response = await makeRequest(discovery.userinfo_endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.statusCode !== 200) {
    log.error('UserInfo fetch failed', { statusCode: response.statusCode });
    throw new Error(`UserInfo fetch failed: ${response.statusCode}`);
  }

  return JSON.parse(response.body);
}

/**
 * Create a signed JWT for state/nonce storage
 * We use the JWT service from n8n when available, but for cookies we just use HMAC
 * @param {object} payload
 * @param {string} secret
 * @param {number} expiresInSeconds
 * @returns {string}
 */
function createSignedCookie(payload, secret, expiresInSeconds = 900) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const data = JSON.stringify({ ...payload, exp });
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const signature = hmac.digest('hex');
  return base64UrlEncode(data) + '.' + signature;
}

/**
 * Verify and decode a signed cookie
 * @param {string} cookie
 * @param {string} secret
 * @returns {object|null}
 */
function verifySignedCookie(cookie, secret) {
  try {
    const [dataB64, signature] = cookie.split('.');
    const data = base64UrlDecode(dataB64).toString('utf8');

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    const expectedSignature = hmac.digest('hex');

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(data);
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Get or create the cookie signing secret
 * We derive it from the n8n encryption key if available
 * @returns {string}
 */
function getCookieSecret() {
  // Use a combination of environment variables to create a stable secret
  const baseKey = process.env.N8N_ENCRYPTION_KEY || process.env.OIDC_CLIENT_SECRET || 'n8n-oidc-hook-secret';
  const hash = crypto
    .createHash('sha256')
    .update(baseKey + '-oidc-state')
    .digest('hex');
  return hash;
}

/**
 * Create the n8n auth cookie using n8n's JwtService
 * @param {object} user
 * @param {object} jwtService - n8n's JwtService instance
 * @returns {string}
 */
function createAuthToken(user, jwtService) {
  // n8n's JWT contains: { id, hash, browserId?, usedMfa? }
  const payload = {
    id: user.id,
    hash: createUserHash(user),
    usedMfa: false,
  };

  return jwtService.sign(payload, { expiresIn: '7d' });
}

/**
 * Create user hash for JWT (mimics n8n's AuthService.createJWTHash)
 * @param {object} user
 * @returns {string}
 */
function createUserHash(user) {
  const payload = [user.email, user.password || ''];
  if (user.mfaEnabled && user.mfaSecret) {
    payload.push(user.mfaSecret.substring(0, 3));
  }
  return crypto.createHash('sha256').update(payload.join(':')).digest('base64').substring(0, 10);
}

/**
 * Check if email is valid
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Export the hooks
const hookConfig = {
  frontend: {
    settings: [
      async function (frontendSettings) {
        const missing = validateN8nOidcConfig(config);
        if (missing.length > 0) {
          return;
        }

        frontendSettings.sso = frontendSettings.sso || {};
        frontendSettings.sso.oidc = {
          loginEnabled: true,
          loginUrl: '/rest/auth/oidc/login',
          callbackUrl: config.redirectUri,
        };

        frontendSettings.userManagement = frontendSettings.userManagement || {};
        frontendSettings.userManagement.authenticationMethod = 'oidc';

        frontendSettings.enterprise = frontendSettings.enterprise || {};
        frontendSettings.enterprise.oidc = true;

        log.info('Frontend settings configured for OIDC');
      },
    ],
  },
};

export = hookConfig;
