// Derive cookie Secure flag from canonical deployment URL/protocol.
//
// Production HTTPS must never silently emit non-Secure cookies. This helper
// validates consistency between N8N_BASE_URL and N8N_PROTOCOL and fails
// closed in production when they disagree or when HTTPS base lacks explicit
// protocol confirmation.
import { N8N_BASE_URL, N8N_PROTOCOL, IS_PRODUCTION } from '@config';

export function getSecureCookieFlag(opts?: { baseUrl?: string; protocol?: string; isProduction?: boolean }): boolean {
  const baseUrl = opts?.baseUrl ?? N8N_BASE_URL;
  const protocol = opts?.protocol ?? N8N_PROTOCOL;
  const isProduction = opts?.isProduction ?? IS_PRODUCTION;

  let baseIsHttps: boolean | null = null;
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol === 'https:') baseIsHttps = true;
      else if (parsed.protocol === 'http:') baseIsHttps = false;
      else baseIsHttps = null;
    } catch {
      baseIsHttps = null;
    }
  }

  const protocolIsHttps = protocol === 'https';
  const protocolIsHttp = protocol === 'http';
  const protocolSet = protocol !== '';

  if (isProduction) {
    if (baseIsHttps === true && !protocolIsHttps) {
      throw new Error(
        `Inconsistent cookie security configuration: N8N_BASE_URL is https (${baseUrl}) but N8N_PROTOCOL is '${protocol || '(empty)'}'. Set N8N_PROTOCOL=https in production.`,
      );
    }
    if (baseIsHttps === false && protocolIsHttps) {
      throw new Error(
        `Inconsistent cookie security configuration: N8N_BASE_URL is http (${baseUrl}) but N8N_PROTOCOL is https. N8N_PROTOCOL and N8N_BASE_URL must agree in production.`,
      );
    }
    if (baseIsHttps === null) {
      if (!protocolSet || !protocolIsHttps) {
        throw new Error(
          `Missing or invalid HTTPS protocol configuration in production: set N8N_BASE_URL to an https URL and N8N_PROTOCOL=https (got baseUrl='${baseUrl || '(empty)'}', protocol='${protocol || '(empty)'}').`,
        );
      }
      // base invalid/missing but protocol is https -> allow, Secure true
    }
  }

  // Derive: prefer canonical base URL when parseable, otherwise protocol flag.
  if (baseIsHttps !== null) return baseIsHttps;
  return protocolIsHttps;
}

export function getCookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/' as const,
    maxAge: 15 * 60 * 1000,
  };
}

export function getAuthCookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/' as const,
    maxAge: 24 * 60 * 60 * 1000,
  };
}
