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
