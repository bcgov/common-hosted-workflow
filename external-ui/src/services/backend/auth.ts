import { instance } from './axios';

export type AuthSessionUser = {
  subject: string;
  email: string;
  preferredUsername?: string;
  name?: string;
};

export type AuthSessionOidc = {
  issuer: string;
  subject: string;
  audience: string[];
  email: string;
  preferredUsername?: string;
  name?: string;
  expiresAt?: number;
  claims: Record<string, unknown>;
};

export type AuthSessionN8nUser = {
  id: string;
  email: string;
  disabled: boolean;
  role: {
    slug: string;
    displayName: string;
  } | null;
};

export type AuthSessionResponse = {
  authenticated: boolean;
  user: AuthSessionUser | null;
  oidc: AuthSessionOidc | null;
  n8nUser: AuthSessionN8nUser | null;
  permissions: Permissions | null;
  tenantRoles: TenantRole[] | null;
};

export type AuthenticatedSession = {
  user: AuthSessionUser;
  oidc: AuthSessionOidc;
  n8nUser: AuthSessionN8nUser;
  permissions: Permissions;
  tenantRoles: TenantRole[];
};

export type Permissions = {
  isAdmin: boolean;
  canViewWorkflows: boolean;
  canRequestAccess: boolean;
  canReviewAccessRequests: boolean;
  canShareWorkflows: boolean;
  canUnshareWorkflows: boolean;
};

export type TenantRole = {
  tenantId: string;
  tenantName: string;
  roles: readonly string[];
};

export type WhoamiResponse = {
  userAgent: string | null;
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
  n8nUser: AuthSessionN8nUser | null;
  permissions: Permissions;
  tenantRoles: TenantRole[] | null;
};

export type AuthExchangeResponse = {
  token: string;
};

export function getWhoami(params?: { signal?: AbortSignal }) {
  return instance.get<WhoamiResponse>('/ui-api/whoami', { signal: params?.signal }).then((res) => res.data);
}

export function getSession(params?: { signal?: AbortSignal }) {
  return instance.get<AuthSessionResponse>('/ui-api/session', { signal: params?.signal }).then((res) => res.data);
}

export function exchangeSession(session: string, params?: { signal?: AbortSignal }) {
  return instance
    .post<AuthExchangeResponse>('/ui-api/auth/exchange', { session }, { signal: params?.signal })
    .then((res) => res.data);
}
