import type { Permissions } from './permissions';

export type OidcDiscoveryDocument = {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
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
  oidc: UiOidcIdentity;
};

export type UiResolvedSession = UiSession & {
  n8nUser: UiSerializedN8nUser;
  permissions: Permissions;
};

export type UiOidcConfig = {
  issuerUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksUri: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
};

import {
  OIDC_ISSUER,
  OIDC_AUTHORIZATION_ENDPOINT,
  OIDC_TOKEN_ENDPOINT,
  OIDC_USERINFO_ENDPOINT,
  OIDC_JWKS_URI,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  UI_OIDC_REDIRECT_URI,
  OIDC_SCOPES,
} from '@config';

export function getOidcConfigFromEnv(): UiOidcConfig {
  return {
    issuerUrl: OIDC_ISSUER,
    authorizationEndpoint: OIDC_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: OIDC_TOKEN_ENDPOINT,
    userinfoEndpoint: OIDC_USERINFO_ENDPOINT,
    jwksUri: OIDC_JWKS_URI,
    clientId: OIDC_CLIENT_ID,
    clientSecret: OIDC_CLIENT_SECRET,
    redirectUri: UI_OIDC_REDIRECT_URI,
    scopes: OIDC_SCOPES,
  };
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
};
