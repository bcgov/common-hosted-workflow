import { createSecretKey } from 'crypto';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import { UI_AUTH_JWT_SECRET, UI_AUTH_JWT_ISSUER, UI_AUTH_JWT_AUDIENCE } from '@config';
import { type UiAuthTokenPayload, type UiOidcIdentity, type UiSession, type UiSerializedN8nUser } from './ui-oidc';
import { extractOidcIdentity, fetchOidcDiscoveryDocument, fetchOidcUserInfo } from './oidc-provider';
import { getOidcConfigFromEnv } from './ui-oidc';

function getBearerToken(req: Request) {
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

export async function getUiSession(req: Request) {
  const token = getBearerToken(req);
  if (!token) return null;

  try {
    return (await tryGetLocalUiSession(token)) ?? (await tryGetUpstreamUiSession(token));
  } catch {
    try {
      return await tryGetUpstreamUiSession(token);
    } catch {
      return null;
    }
  }
}
