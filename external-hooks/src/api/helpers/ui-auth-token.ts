import { createSecretKey } from 'crypto';
import { SignJWT } from 'jose';
import { UI_AUTH_JWT_SECRET, UI_AUTH_JWT_ISSUER, UI_AUTH_JWT_AUDIENCE, UI_AUTH_USE_SEPARATE_TOKEN } from '@config';
import type { UiAuthTokenPayload, UiOidcIdentity } from './ui-oidc';

const UI_AUTH_JWT_TTL_MS = 8 * 60 * 60 * 1000;

export function resolveAccessTokenExpiresAt(expiresInSeconds?: number) {
  return typeof expiresInSeconds === 'number' ? Date.now() + expiresInSeconds * 1000 : undefined;
}

export function shouldRefreshAccessToken(expiresAt?: number) {
  return typeof expiresAt === 'number' && Date.now() >= expiresAt;
}

export const UI_AUTH_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export function shouldRefreshSeparateToken(expiresAt?: number) {
  if (typeof expiresAt !== 'number') return false;
  const now = Date.now();
  if (expiresAt <= now) return false;
  return expiresAt - now <= UI_AUTH_REFRESH_WINDOW_MS;
}

export function isSeparateTokenExpired(expiresAt?: number): boolean {
  if (typeof expiresAt !== 'number') return false;
  return Date.now() >= expiresAt;
}

export function isRefreshTokenExpired(expiresAt?: number): boolean {
  if (typeof expiresAt !== 'number') return false;
  return Date.now() > expiresAt;
}

export async function createUiAuthToken(params: {
  oidc: UiOidcIdentity;
  upstreamExpiresAt?: number;
  sessionId?: string;
}) {
  if (!UI_AUTH_JWT_SECRET) {
    throw new Error('UI auth JWT secret is not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const maxExpiresAt = now + Math.floor(UI_AUTH_JWT_TTL_MS / 1000);
  const upstreamExpiresAt = params.upstreamExpiresAt ? Math.floor(params.upstreamExpiresAt / 1000) : undefined;
  const expiresAt = upstreamExpiresAt ? Math.min(maxExpiresAt, upstreamExpiresAt) : maxExpiresAt;

  if (expiresAt <= now) {
    throw new Error('Upstream token is already expired');
  }

  return new SignJWT({
    email: params.oidc.email,
    preferredUsername: params.oidc.preferredUsername,
    name: params.oidc.name,
    ...(params.sessionId ? { sid: params.sessionId } : {}),
    oidc: {
      ...params.oidc,
      claims: params.oidc.claims,
    },
  } satisfies Omit<UiAuthTokenPayload, 'iss' | 'aud' | 'sub'>)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(UI_AUTH_JWT_ISSUER)
    .setAudience(UI_AUTH_JWT_AUDIENCE)
    .setSubject(params.oidc.subject)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(createSecretKey(Buffer.from(UI_AUTH_JWT_SECRET)));
}

export async function issueUiSessionToken(params: {
  oidc: UiOidcIdentity;
  upstreamAccessToken?: string;
  upstreamExpiresAt?: number;
  sessionId?: string;
}) {
  if (UI_AUTH_USE_SEPARATE_TOKEN) {
    if (!params.sessionId) {
      // Separate JWTs must carry the per-session identifier so logout can
      // revoke them server-side.
      throw new Error('UI session id is required for separate-token sessions');
    }
    return await createUiAuthToken({
      oidc: params.oidc,
      upstreamExpiresAt: params.upstreamExpiresAt,
      sessionId: params.sessionId,
    });
  }

  if (!params.upstreamAccessToken) {
    throw new Error('OIDC provider did not return an access token');
  }

  return params.upstreamAccessToken;
}
