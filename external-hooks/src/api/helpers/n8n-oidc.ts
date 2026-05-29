import crypto from 'node:crypto';
import { type OidcProviderConfig } from './oidc-provider';

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
    issuerUrl: process.env.OIDC_ISSUER || '',
    authorizationEndpoint: process.env.OIDC_AUTHORIZATION_ENDPOINT || '',
    tokenEndpoint: process.env.OIDC_TOKEN_ENDPOINT || '',
    userinfoEndpoint: process.env.OIDC_USERINFO_ENDPOINT || '',
    jwksUri: process.env.OIDC_JWKS_URI || '',
    clientId: process.env.OIDC_CLIENT_ID || '',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
    redirectUri: process.env.OIDC_REDIRECT_URI || '',
    scopes: process.env.OIDC_SCOPES || 'openid email profile',
    rolesClaim: process.env.OIDC_ROLES_CLAIM || 'roles',
    restrictNoRole: process.env.SSO_RESTRICT_NO_ROLE === 'true',
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
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(input: string) {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
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
  const baseKey = process.env.N8N_ENCRYPTION_KEY || process.env.OIDC_CLIENT_SECRET || 'n8n-oidc-hook-secret';
  return crypto
    .createHash('sha256')
    .update(baseKey + '-oidc-state')
    .digest('hex');
}

export function createAuthToken(
  user: N8nOidcUser,
  jwtService: {
    sign: (payload: { id: string; hash: string; usedMfa: boolean }, options: { expiresIn: string }) => string;
  },
) {
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
