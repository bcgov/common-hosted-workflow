/**
 * Builds a URL path from segments, encoding each segment to prevent injection.
 *
 * @example
 * buildPath('tenants', tenantId, 'users', userId, 'roles')
 * // => "tenants/abc-123/users/def-456/roles"
 *
 * @example
 * buildPath('users', 'user with spaces', 'tenants')
 * // => "users/user%20with%20spaces/tenants"
 */
export function buildPath(...segments: string[]): string {
  return segments.map((s) => encodeURIComponent(s)).join('/');
}

/**
 * Extracts the scheme + host (origin) from an absolute URL, discarding any path,
 * query, or fragment. Returns `null` when the value is not a parseable absolute URL.
 *
 * @example
 * extractOrigin('https://chefs-dev.example.gov.bc.ca/app/api/v1')
 * // => "https://chefs-dev.example.gov.bc.ca"
 *
 * @example
 * extractOrigin('not a url')
 * // => null
 */
export function extractOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
