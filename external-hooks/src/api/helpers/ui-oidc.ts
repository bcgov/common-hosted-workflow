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
  n8nUser: UiSerializedN8nUser;
};

export type UiAuthenticatedSession = UiSession & {
  n8nUser: UiSerializedN8nUser;
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

export function getOidcConfigFromEnv(): UiOidcConfig {
  return {
    issuerUrl: process.env.UI_OIDC_ISSUER || process.env.OIDC_ISSUER || '',
    authorizationEndpoint: process.env.UI_OIDC_AUTHORIZATION_ENDPOINT || process.env.OIDC_AUTHORIZATION_ENDPOINT || '',
    tokenEndpoint: process.env.UI_OIDC_TOKEN_ENDPOINT || process.env.OIDC_TOKEN_ENDPOINT || '',
    userinfoEndpoint: process.env.UI_OIDC_USERINFO_ENDPOINT || process.env.OIDC_USERINFO_ENDPOINT || '',
    jwksUri: process.env.UI_OIDC_JWKS_URI || process.env.OIDC_JWKS_URI || '',
    clientId: process.env.UI_OIDC_CLIENT_ID || process.env.OIDC_CLIENT_ID || '',
    clientSecret: process.env.UI_OIDC_CLIENT_SECRET || process.env.OIDC_CLIENT_SECRET || '',
    redirectUri: process.env.UI_OIDC_REDIRECT_URI || '',
    scopes: process.env.UI_OIDC_SCOPES || process.env.OIDC_SCOPES || 'openid email profile',
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
};
