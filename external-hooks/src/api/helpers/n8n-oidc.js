'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.getN8nOidcConfigFromEnv = getN8nOidcConfigFromEnv;
exports.validateN8nOidcConfig = validateN8nOidcConfig;
exports.createSignedCookie = createSignedCookie;
exports.verifySignedCookie = verifySignedCookie;
exports.getCookieSecret = getCookieSecret;
exports.createAuthToken = createAuthToken;
exports.createUserHash = createUserHash;
exports.isValidEmail = isValidEmail;
exports.parseN8nOidcRole = parseN8nOidcRole;
const node_crypto_1 = __importDefault(require('node:crypto'));
const _config_1 = require('@config');
function getN8nOidcConfigFromEnv() {
  return {
    issuerUrl: _config_1.OIDC_ISSUER,
    authorizationEndpoint: _config_1.OIDC_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: _config_1.OIDC_TOKEN_ENDPOINT,
    userinfoEndpoint: _config_1.OIDC_USERINFO_ENDPOINT,
    jwksUri: _config_1.OIDC_JWKS_URI,
    endSessionEndpoint: _config_1.OIDC_END_SESSION_ENDPOINT,
    useManualEndpoints: _config_1.OIDC_USE_MANUAL_ENDPOINTS,
    clientId: _config_1.OIDC_CLIENT_ID,
    clientSecret: _config_1.OIDC_CLIENT_SECRET,
    redirectUri: _config_1.OIDC_REDIRECT_URI,
    scopes: _config_1.OIDC_SCOPES,
    rolesClaim: _config_1.OIDC_ROLES_CLAIM,
    restrictNoRole: _config_1.SSO_RESTRICT_NO_ROLE,
  };
}
function validateN8nOidcConfig(config) {
  const missing = [];
  // OIDC_ISSUER is mandatory in every supported configuration mode.
  // Manual endpoint mode without an issuer would allow ID-token verification
  // without an issuer constraint — default to requiring issuer unless a
  // documented provider compatibility need is reviewed.
  if (!config.issuerUrl) missing.push('OIDC_ISSUER');
  if (!config.issuerUrl) {
    if (!config.authorizationEndpoint) missing.push('OIDC_AUTHORIZATION_ENDPOINT');
    if (!config.tokenEndpoint) missing.push('OIDC_TOKEN_ENDPOINT');
    if (!config.userinfoEndpoint) missing.push('OIDC_USERINFO_ENDPOINT');
    if (!config.jwksUri) missing.push('OIDC_JWKS_URI');
  }
  if (!config.clientId) missing.push('OIDC_CLIENT_ID');
  if (!config.clientSecret) missing.push('OIDC_CLIENT_SECRET');
  if (!config.redirectUri) missing.push('OIDC_REDIRECT_URI');
  return missing;
}
function base64UrlEncode(input) {
  const base64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64');
  return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function base64UrlDecode(input) {
  let base64 = input.replaceAll('-', '+').replaceAll('_', '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}
function createSignedCookie(payload, secret, expiresInSeconds = 900) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const data = JSON.stringify({ ...payload, exp });
  const hmac = node_crypto_1.default.createHmac('sha256', secret);
  hmac.update(data);
  const signature = hmac.digest('hex');
  return `${base64UrlEncode(data)}.${signature}`;
}
function verifySignedCookie(cookie, secret) {
  try {
    const dotIndex = cookie.lastIndexOf('.');
    if (dotIndex === -1) return null;
    const dataB64 = cookie.slice(0, dotIndex);
    const signature = cookie.slice(dotIndex + 1);
    if (!dataB64 || !signature) return null;
    const data = base64UrlDecode(dataB64).toString('utf8');
    const hmac = node_crypto_1.default.createHmac('sha256', secret);
    hmac.update(data);
    const expectedSignature = hmac.digest('hex');
    if (signature.length !== expectedSignature.length) {
      return null;
    }
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSignature, 'utf8');
    if (!node_crypto_1.default.timingSafeEqual(sigBuf, expBuf)) {
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
function getCookieSecret() {
  return node_crypto_1.default
    .createHash('sha256')
    .update(_config_1.OIDC_COOKIE_SECRET_BASE + '-oidc-state')
    .digest('hex');
}
function createAuthToken(user, jwtService) {
  const payload = {
    id: user.id,
    hash: createUserHash(user),
    usedMfa: false,
  };
  // 'session' = n8n's browser auth cookie purpose (aud: 'n8n:session'); n8n's AuthService verifies
  // the cookie with jwtService.verify('session', ...), so the minted token must carry that audience.
  return jwtService.sign('session', payload, { expiresIn: '7d' });
}
function createUserHash(user) {
  const payload = [user.email, user.password || ''];
  if (user.mfaEnabled && user.mfaSecret) {
    payload.push(user.mfaSecret.substring(0, 3));
  }
  return node_crypto_1.default.createHash('sha256').update(payload.join(':')).digest('base64').substring(0, 10);
}
function isValidEmail(email) {
  for (const char of email) {
    if (char.trim() === '') {
      return false;
    }
  }
  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex !== email.lastIndexOf('@') || atIndex >= email.length - 1) {
    return false;
  }
  const dotIndex = email.indexOf('.', atIndex + 2);
  return dotIndex > atIndex + 1 && dotIndex < email.length - 1;
}
function parseN8nOidcRole(value) {
  const roles = (value ?? '')
    .toString()
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
  const allowed = ['global:owner', 'global:admin', 'global:member'];
  for (const role of roles) {
    if (allowed.includes(role)) {
      return role;
    }
  }
  return '';
}
