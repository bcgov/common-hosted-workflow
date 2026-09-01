// Canonical validation for every browser return/continuation target.
//
// Policy is injected by the caller (allowed origins, per-purpose path
// prefixes, fallback). `resolveReturnTarget()` never reads environment
// variables so it stays directly testable; `createReturnTargetPolicy()` is
// the config-backed factory used by the routers.
import { N8N_BASE_URL, UI_APP_BASE_URL } from '@config';
import { buildUiAppUrl } from './url';

export type ReturnTargetPurpose = 'login' | 'logout' | 'continuation';

export type ReturnTargetPolicy = {
  /** Absolute URL used to resolve relative candidates. */
  trustedBase: string;
  /** Explicitly allowed destination origins (serialized URL origins). */
  allowedOrigins: readonly string[];
  /** Allowed destination path prefixes per purpose. */
  pathPrefixes: Record<ReturnTargetPurpose, readonly string[]>;
  /** Safe destination returned whenever a candidate is rejected. */
  fallback: string;
};

function containsControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function matchesPathPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => {
    if (pathname === prefix) return true;
    const withBoundary = prefix.endsWith('/') ? prefix : `${prefix}/`;
    return pathname.startsWith(withBoundary);
  });
}

/**
 * Resolve a caller-supplied return target against a trusted base and validate
 * it against the injected policy. Returns a canonical destination string, the
 * policy fallback when the candidate is present but unsafe, or `undefined`
 * when no candidate was supplied at all.
 */
export function resolveReturnTarget(
  candidate: unknown,
  purpose: ReturnTargetPurpose,
  policy: ReturnTargetPolicy,
): string | undefined {
  if (candidate === undefined || candidate === null || candidate === '') {
    return undefined;
  }
  if (typeof candidate !== 'string') {
    return policy.fallback;
  }

  // Reject authority-relative and backslash network-path forms, encoded
  // backslashes, and control characters before any URL normalization.
  if (
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /%5c/i.test(candidate) ||
    containsControlCharacters(candidate)
  ) {
    return policy.fallback;
  }

  let url: URL;
  try {
    url = new URL(candidate, policy.trustedBase);
  } catch {
    return policy.fallback;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return policy.fallback;
  }
  if (url.username !== '' || url.password !== '') {
    return policy.fallback;
  }
  if (!policy.allowedOrigins.includes(url.origin)) {
    return policy.fallback;
  }

  // URL parsing canonicalizes `..`, `.`, and duplicate slashes in the
  // pathname; decode what remains to catch encoded bypasses before applying
  // the path policy.
  const decodedPathname = safeDecode(url.pathname);
  if (decodedPathname === null || decodedPathname.includes('\\') || containsControlCharacters(decodedPathname)) {
    return policy.fallback;
  }
  if (!matchesPathPrefix(decodedPathname, policy.pathPrefixes[purpose])) {
    return policy.fallback;
  }

  // Preserve the caller's shape: absolute candidates stay absolute, relative
  // candidates stay relative. Query string and fragment are retained.
  if (isAbsoluteUrl(candidate)) {
    return url.toString();
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

const ABSOLUTE_URL_PATTERN = /^https?:\/\//;

/**
 * Build the redirect policy for OIDC return targets from the configured
 * deployment URLs. Configuration is resolved once per router (not inside the
 * parser) so the policy stays directly testable.
 */
export function createReturnTargetPolicy(): ReturnTargetPolicy {
  const absoluteBases = [UI_APP_BASE_URL, N8N_BASE_URL].filter((base) => ABSOLUTE_URL_PATTERN.test(base));
  const trustedBase = absoluteBases[0] ?? 'http://localhost';
  const allowedOrigins = new Set<string>();
  for (const base of [trustedBase, ...absoluteBases]) {
    allowedOrigins.add(new URL(base).origin);
  }

  const uiBasePath = new URL(UI_APP_BASE_URL || '/ui', trustedBase).pathname.replace(/\/+$/, '') || '/';
  const uiPrefixes = uiBasePath === '/' ? ['/'] : [uiBasePath];

  return {
    trustedBase,
    allowedOrigins: [...allowedOrigins],
    pathPrefixes: {
      login: uiPrefixes,
      logout: uiPrefixes,
      continuation: ['/'],
    },
    fallback: buildUiAppUrl('/'),
  };
}
