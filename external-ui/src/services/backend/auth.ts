import { instance } from './axios';

export type WhoamiResponse = {
  ok: boolean;
  route: string;
  method: string;
  userAgent: string | null;
  oidc: {
    issuer: string;
    subject: string;
    audience: string[];
    azp?: string;
    email?: string;
    preferredUsername?: string;
    name?: string;
    scope?: string;
    expiresAt?: number;
    issuedAt?: number;
    notBefore?: number;
    claims: Record<string, unknown>;
  } | null;
  n8nUser: {
    id: string;
    email: string;
    role: {
      slug: string;
      displayName: string;
    } | null;
  } | null;
};

export async function getWhoami(params?: { signal?: AbortSignal }) {
  return instance.get<WhoamiResponse>('/ui-api/whoami', { signal: params?.signal }).then((res) => res.data);
}
