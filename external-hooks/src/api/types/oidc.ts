import type { JWTHeaderParameters, JWTPayload } from 'jose';

export interface OidcTokenDetails {
  token: string;
  header: JWTHeaderParameters;
  claims: JWTPayload & Record<string, unknown>;
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
}
