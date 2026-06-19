import { createSecretKey } from 'crypto';
import type { Request } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { UI_AUTH_JWT_SECRET, UI_AUTH_JWT_ISSUER, UI_AUTH_JWT_AUDIENCE } from '@config';
import {
  type UiIdentitySession,
  type UiAuthTokenPayload,
  type UiOidcIdentity,
  type UiSerializedN8nUser,
} from './ui-oidc';

const UI_AUTH_JWT_TTL_MS = 8 * 60 * 60 * 1000;

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

export async function createUiAuthToken(params: { oidc: UiOidcIdentity }) {
  if (!UI_AUTH_JWT_SECRET) {
    throw new Error('UI auth JWT secret is not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: params.oidc.email,
    preferredUsername: params.oidc.preferredUsername,
    name: params.oidc.name,
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
    .setExpirationTime(now + Math.floor(UI_AUTH_JWT_TTL_MS / 1000))
    .sign(createSecretKey(Buffer.from(UI_AUTH_JWT_SECRET)));
}

export async function getUiSession(req: Request) {
  const token = getBearerToken(req);
  if (!token) return null;

  try {
    if (!UI_AUTH_JWT_SECRET) return null;

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
    } as UiIdentitySession;
  } catch {
    return null;
  }
}
