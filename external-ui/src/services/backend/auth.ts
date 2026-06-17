import { instance } from './axios';

export type AuthSessionUser = {
  subject: string;
  email: string;
  preferredUsername?: string;
  name?: string;
};

export type AuthSessionResponse = {
  authenticated: boolean;
  user: AuthSessionUser | null;
};

export type WhoamiResponse = {
  ok: boolean;
  route: string;
  method: string;
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
  n8nUser: {
    id: string;
    email: string;
    disabled: boolean;
    role: {
      slug: string;
      displayName: string;
    } | null;
  } | null;
};

export async function getWhoami(params?: { signal?: AbortSignal }) {
  return instance.get<WhoamiResponse>('/ui-api/whoami', { signal: params?.signal }).then((res) => res.data);
}

export async function getSession(params?: { signal?: AbortSignal }) {
  return instance.get<AuthSessionResponse>('/ui-api/session', { signal: params?.signal }).then((res) => res.data);
}
