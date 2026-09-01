import type { Permissions } from './permissions';
import type { TenantRole, TenantGroup } from './ui-oidc-store';

export type OidcDiscoveryDocument = {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  end_session_endpoint?: string;
};

export type UiSession = {
  subject: string;
  email: string;
  preferredUsername?: string;
  name?: string;
  issuer: string;
  audience: string[];
  claims: Record<string, unknown>;
  expiresAt?: number;
};

export type UiOidcIdentity = {
  subject: string;
  email: string;
  preferredUsername?: string;
  name?: string;
  issuer: string;
  audience: string[];
  claims: Record<string, unknown>;
};

export type UiSerializedRole = {
  slug: string;
  displayName: string;
};

export type UiSerializedN8nUser = {
  id: string;
  email: string;
  disabled: boolean;
  role: UiSerializedRole | null;
};

export type UiAuthTokenPayload = {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  preferredUsername?: string;
  name?: string;
  /** Per-session issue identifier checked against server state for revocation. */
  sid?: string;
  oidc: UiOidcIdentity;
};

export type UiResolvedSession = UiSession & {
  n8nUser: UiSerializedN8nUser | null;
  permissions: Permissions;
  tenantRoles: TenantRole[];
  tenantGroups: TenantGroup[];
  /**
   * Upstream OIDC access token for CSTAR/provider calls.
   * Distinct from the UI bearer (which may be an app JWT in separate-token mode).
   * Never exposed via public session types (buildSessionSummary/buildWhoamiResponse)
   * or API responses; internal use only.
   */
  upstreamAccessToken?: string;
};

// UiOidcConfig is now an alias to the single-source N8nOidcConfig / OidcProviderConfig.
// The sole redirect URI is OIDC_REDIRECT_URI = `${N8N_BASE_URL}/rest/auth/oidc/callback`.
// Deployment verification on 2026-08-31 confirmed no active provider registration
// targets the legacy `/ui-api/auth/callback`; that URI is intentionally removed.
import { getN8nOidcConfigFromEnv, type N8nOidcConfig } from './n8n-oidc';

export type UiOidcConfig = N8nOidcConfig;

/** @deprecated Use getN8nOidcConfigFromEnv() – single injected OIDC config. Kept for transition. */
export function getOidcConfigFromEnv(): UiOidcConfig {
  return getN8nOidcConfigFromEnv();
}

export type UiSessionSummary = {
  authenticated: boolean;
  user: {
    subject: string;
    email: string;
    preferredUsername?: string;
    name?: string;
  } | null;
  oidc: {
    issuer: string;
    subject: string;
    audience: string[];
    email: string;
    preferredUsername?: string;
    name?: string;
    expiresAt?: number;
    claims: Record<string, unknown>;
  } | null;
  n8nUser: UiSerializedN8nUser | null;
  permissions: Permissions | null;
  tenantRoles: TenantRole[] | null;
  tenantGroups: TenantGroup[] | null;
};

export type WhoamiResponse = {
  oidc: UiSessionSummary['oidc'];
  n8nUser: UiSerializedN8nUser | null;
  permissions: Permissions | null;
  tenantRoles: TenantRole[] | null;
  tenantGroups: TenantGroup[] | null;
  userAgent?: string;
};

export function buildSessionSummary(session: UiResolvedSession | null): UiSessionSummary {
  if (!session) {
    return {
      authenticated: false,
      user: null,
      oidc: null,
      n8nUser: null,
      permissions: null,
      tenantRoles: null,
      tenantGroups: null,
    };
  }

  return {
    authenticated: true,
    user: {
      subject: session.subject,
      email: session.email,
      preferredUsername: session.preferredUsername,
      name: session.name,
    },
    oidc: {
      issuer: session.issuer,
      subject: session.subject,
      audience: session.audience,
      email: session.email,
      preferredUsername: session.preferredUsername,
      name: session.name,
      expiresAt: session.expiresAt,
      claims: session.claims,
    },
    n8nUser: session.n8nUser,
    permissions: session.permissions,
    tenantRoles: session.tenantRoles,
    tenantGroups: session.tenantGroups,
  };
}

export function buildWhoamiResponse(session: UiResolvedSession, userAgent?: string): WhoamiResponse {
  return {
    oidc: buildSessionSummary(session).oidc,
    n8nUser: session.n8nUser,
    permissions: session.permissions,
    tenantRoles: session.tenantRoles,
    tenantGroups: session.tenantGroups,
    userAgent,
  };
}
