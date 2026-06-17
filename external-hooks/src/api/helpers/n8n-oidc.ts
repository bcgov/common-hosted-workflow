import crypto from 'node:crypto';
import {
  OIDC_ISSUER,
  OIDC_AUTHORIZATION_ENDPOINT,
  OIDC_TOKEN_ENDPOINT,
  OIDC_USERINFO_ENDPOINT,
  OIDC_JWKS_URI,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_REDIRECT_URI,
  OIDC_SCOPES,
  OIDC_ROLES_CLAIM,
  SSO_RESTRICT_NO_ROLE,
  OIDC_COOKIE_SECRET_BASE,
} from '@config';
import { type OidcProviderConfig } from './oidc-provider';
import type { JwtService } from '../services/jwt';

export type N8nOidcRoleSlug = 'global:owner' | 'global:admin' | 'global:member';

export type N8nOidcConfig = OidcProviderConfig & {
  rolesClaim: string;
  restrictNoRole: boolean;
};

export type N8nOidcUser = {
  id: string;
  email: string;
  password?: string;
  mfaEnabled?: boolean;
  mfaSecret?: string;
  role?: { slug: string } | null;
};

export type N8nOidcStateCookiePayload = {
  state?: string;
  codeVerifier?: string;
  redirectUri?: string;
  exp?: number;
};

export type N8nOidcNonceCookiePayload = {
  nonce?: string;
  exp?: number;
};

export function getN8nOidcConfigFromEnv(): N8nOidcConfig {
  return {
    issuerUrl: OIDC_ISSUER,
    authorizationEndpoint: OIDC_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: OIDC_TOKEN_ENDPOINT,
    userinfoEndpoint: OIDC_USERINFO_ENDPOINT,
    jwksUri: OIDC_JWKS_URI,
    clientId: OIDC_CLIENT_ID,
    clientSecret: OIDC_CLIENT_SECRET,
    redirectUri: OIDC_REDIRECT_URI,
    scopes: OIDC_SCOPES,
    rolesClaim: OIDC_ROLES_CLAIM,
    restrictNoRole: SSO_RESTRICT_NO_ROLE,
  };
}

export function validateN8nOidcConfig(config: N8nOidcConfig) {
  const missing = [] as string[];
  if (!config.issuerUrl) {
    if (!config.authorizationEndpoint && !config.tokenEndpoint && !config.userinfoEndpoint) {
      missing.push('OIDC_ISSUER');
    }
  }
  if (!config.clientId) missing.push('OIDC_CLIENT_ID');
  if (!config.clientSecret) missing.push('OIDC_CLIENT_SECRET');
  if (!config.redirectUri) missing.push('OIDC_REDIRECT_URI');
  return missing;
}

function base64UrlEncode(input: Buffer | string) {
  const base64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64');
  return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(input: string) {
  let base64 = input.replaceAll('-', '+').replaceAll('_', '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

export function createSignedCookie(payload: object, secret: string, expiresInSeconds = 900) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const data = JSON.stringify({ ...payload, exp });
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const signature = hmac.digest('hex');
  return `${base64UrlEncode(data)}.${signature}`;
}

export function verifySignedCookie(cookie: string, secret: string) {
  try {
    const [dataB64, signature] = cookie.split('.');
    const data = base64UrlDecode(dataB64).toString('utf8');

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    const expectedSignature = hmac.digest('hex');

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(data) as { exp?: number } & Record<string, unknown>;
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getCookieSecret() {
  return crypto
    .createHash('sha256')
    .update(OIDC_COOKIE_SECRET_BASE + '-oidc-state')
    .digest('hex');
}

export function createAuthToken(user: N8nOidcUser, jwtService: JwtService) {
  const payload = {
    id: user.id,
    hash: createUserHash(user),
    usedMfa: false,
  };

  return jwtService.sign(payload, { expiresIn: '7d' });
}

export function createUserHash(user: Pick<N8nOidcUser, 'email' | 'password' | 'mfaEnabled' | 'mfaSecret'>) {
  const payload = [user.email, user.password || ''];
  if (user.mfaEnabled && user.mfaSecret) {
    payload.push(user.mfaSecret.substring(0, 3));
  }
  return crypto.createHash('sha256').update(payload.join(':')).digest('base64').substring(0, 10);
}

export function isValidEmail(email: string) {
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

export function parseN8nOidcRole(value: unknown): N8nOidcRoleSlug | '' {
  const roles = (value ?? '')
    .toString()
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);

  if (roles.length > 0 && ['global:owner', 'global:admin', 'global:member'].includes(roles[0])) {
    return roles[0] as N8nOidcRoleSlug;
  }

  return '';
}
