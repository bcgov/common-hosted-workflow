import { createSecretKey } from 'crypto';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import { UI_AUTH_JWT_SECRET, UI_AUTH_JWT_ISSUER, UI_AUTH_JWT_AUDIENCE, UI_AUTH_USE_SEPARATE_TOKEN } from '@config';
import { type UiAuthTokenPayload, type UiSession, type UiSerializedN8nUser } from './ui-oidc';
import { extractOidcIdentity, fetchOidcDiscoveryDocument, fetchOidcUserInfo, refreshOidcTokens } from './oidc-provider';
import {
  getUiOidcAccessTokenRecord,
  getUiOidcRefreshTokenRecord,
  setUiOidcAccessTokenRecord,
  setUiOidcIdToken,
  setUiOidcRefreshTokenWithExpiry,
} from './ui-oidc-store';
import {
  issueUiSessionToken,
  resolveAccessTokenExpiresAt,
  shouldRefreshAccessToken,
  isRefreshTokenExpired,
} from './ui-auth-token';
import { getOidcConfigFromEnv } from './ui-oidc';
import { invalidateTenantRoles } from './tenant-roles';
import { invalidateTenantGroups } from './tenant-groups';
import { createLogger } from '../utils/logger';

const log = createLogger('UiSession');

export function getBearerToken(req: Request) {
  const header = req.header('authorization');
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export function serializeN8nUser(
  user: { id: string; email: string; disabled: boolean; role: { slug: string; displayName: string } | null } | null,
): UiSerializedN8nUser | null {
  return user
    ? {
        id: user.id,
        email: user.email,
        disabled: user.disabled,
        role: user.role ? { slug: user.role.slug, displayName: user.role.displayName } : null,
      }
    : null;
}

function tryGetTokenExpiryMs(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return undefined;
    }

    let base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

async function tryGetLocalUiSession(token: string): Promise<UiSession | null> {
  if (!UI_AUTH_JWT_SECRET) {
    return null;
  }

  const verification = await jwtVerify(token, createSecretKey(Buffer.from(UI_AUTH_JWT_SECRET)), {
    issuer: UI_AUTH_JWT_ISSUER,
    audience: UI_AUTH_JWT_AUDIENCE,
  });

  const payload = verification.payload as Partial<UiAuthTokenPayload>;
  if (!payload.sub || !payload.email || !payload.oidc) return null;

  return {
    subject: payload.sub,
    email: payload.email,
    preferredUsername: payload.preferredUsername,
    name: payload.name,
    issuer: payload.oidc.issuer,
    audience: payload.oidc.audience,
    claims: payload.oidc.claims,
    expiresAt: verification.payload.exp ? verification.payload.exp * 1000 : undefined,
  } satisfies UiSession;
}

async function tryGetUpstreamUiSession(token: string): Promise<UiSession | null> {
  const config = getOidcConfigFromEnv();
  if (!config.clientId) {
    return null;
  }

  const discovery = await fetchOidcDiscoveryDocument(config);
  const claims = await fetchOidcUserInfo({ accessToken: token, discovery, config });
  if (!claims) {
    return null;
  }

  const identity = extractOidcIdentity({ claims, discovery, config });
  if (!identity.email) {
    return null;
  }

  return {
    subject: identity.subject,
    email: identity.email,
    preferredUsername: identity.preferredUsername,
    name: identity.name,
    issuer: identity.issuer,
    audience: identity.audience,
    claims: identity.claims,
    expiresAt: tryGetTokenExpiryMs(token),
  } satisfies UiSession;
}

type UiSessionResult = {
  session: UiSession;
  refreshedToken?: string;
  upstreamAccessToken?: string;
};

async function buildUpstreamSessionFromToken(token: string, expiresAt?: number) {
  const session = await tryGetUpstreamUiSession(token);
  if (!session) {
    return null;
  }

  if (expiresAt) {
    session.expiresAt = expiresAt;
  }

  return session;
}

async function refreshSessionByEmail(email: string, currentAccessToken?: string): Promise<UiSessionResult | null> {
  const refreshTokenRecord = await getUiOidcRefreshTokenRecord(email);
  if (!refreshTokenRecord?.token) {
    log.debug('Refresh attempted but no refresh token stored', { email });
    return null;
  }

  if (isRefreshTokenExpired(refreshTokenRecord.expiresAt)) {
    log.warn('Refresh token is expired', { email });
    return null;
  }

  log.info('Refresh attempted', { email });

  try {
    const config = getOidcConfigFromEnv();
    const discovery = await fetchOidcDiscoveryDocument(config);
    const refreshed = await refreshOidcTokens({ refreshToken: refreshTokenRecord.token, discovery, config });
    if (!refreshed.access_token) {
      log.warn('Refresh failed: no access_token in response', { email });
      return null;
    }

    log.info('Refresh succeeded', { email });

    const refreshedExpiresAt = resolveAccessTokenExpiresAt(refreshed.expires_in);
    const session = await buildUpstreamSessionFromToken(refreshed.access_token, refreshedExpiresAt);
    if (!session) {
      log.warn('Refresh succeeded but failed to build session from new token', { email });
      return null;
    }

    if (refreshed.refresh_token) {
      const refreshExpiresAt = refreshed.refresh_expires_in
        ? Date.now() + refreshed.refresh_expires_in * 1000
        : undefined;
      await setUiOidcRefreshTokenWithExpiry(email, refreshed.refresh_token, refreshExpiresAt);
    }
    if (refreshed.id_token) {
      await setUiOidcIdToken(email, refreshed.id_token);
    }
    await setUiOidcAccessTokenRecord(email, refreshed.access_token, refreshedExpiresAt);

    // Invalidate tenant roles and groups cache — will be re-fetched with new token on next session call
    await invalidateTenantRoles(email);
    await invalidateTenantGroups(email);

    const refreshedToken = await issueUiSessionToken({
      oidc: {
        subject: session.subject,
        email: session.email,
        preferredUsername: session.preferredUsername,
        name: session.name,
        issuer: session.issuer,
        audience: session.audience,
        claims: session.claims,
      },
      upstreamAccessToken: refreshed.access_token,
      upstreamExpiresAt: refreshedExpiresAt,
    });

    return { session, refreshedToken, upstreamAccessToken: refreshed.access_token };
  } catch (error) {
    log.warn('Refresh failed with exception', {
      email,
      message: error instanceof Error ? error.message : 'Unknown refresh error',
    });
    return null;
  }
}

async function resolveLocalUiSession(token: string): Promise<UiSessionResult | null> {
  const session = await tryGetLocalUiSession(token);
  if (!session) {
    return null;
  }

  if (!shouldRefreshAccessToken(session.expiresAt)) {
    return { session };
  }

  const refreshed = await refreshSessionByEmail(session.email);

  if (refreshed) {
    return refreshed;
  }

  return null;
}

async function resolveUpstreamUiSession(token: string): Promise<UiSessionResult | null> {
  const record = await getUiOidcAccessTokenRecord(token);
  const knownExpiresAt = record?.expiresAt;

  if (record?.email && shouldRefreshAccessToken(knownExpiresAt)) {
    const session = await buildUpstreamSessionFromToken(token, knownExpiresAt);
    if (!session) {
      return await refreshSessionByEmail(record.email, token);
    }

    const refreshed = await refreshSessionByEmail(record.email, token);

    return refreshed ?? null;
  }

  const session = await buildUpstreamSessionFromToken(token, knownExpiresAt);
  if (session) {
    return { session };
  }

  if (!record?.email) {
    return null;
  }

  return await refreshSessionByEmail(record.email, token);
}

export async function getUiSession(req: Request) {
  const token = getBearerToken(req);
  if (!token) return null;

  try {
    return UI_AUTH_USE_SEPARATE_TOKEN ? await resolveLocalUiSession(token) : await resolveUpstreamUiSession(token);
  } catch {
    return null;
  }
}

export { refreshSessionByEmail };
