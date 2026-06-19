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
};

export type AuthenticatedSession = {
  user: AuthSessionUser;
  oidc: AuthSessionOidc;
  n8nUser: AuthSessionN8nUser;
  permissions: Permissions;
};

export type Permissions = {
  isAdmin: boolean;
  canRequestAccess: boolean;
  canReviewAccessRequests: boolean;
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
};

export function getWhoami(params?: { signal?: AbortSignal }) {
  return instance.get<WhoamiResponse>('/ui-api/whoami', { signal: params?.signal }).then((res) => res.data);
}

export function getSession(params?: { signal?: AbortSignal }) {
  return instance.get<AuthSessionResponse>('/ui-api/session', { signal: params?.signal }).then((res) => res.data);
}
