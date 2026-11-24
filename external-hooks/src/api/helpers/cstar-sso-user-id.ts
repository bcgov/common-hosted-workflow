/**
 * Resolves the CSTAR SSO user ID from OIDC claims.
 *
 * CSTAR expects the IDP user GUID (e.g. idir_user_guid or bceid_user_guid),
 * not the Keycloak subject. Falls back to subject, then email.
 */
export function resolveCstarSsoUserId(
  claims: Record<string, unknown>,
  subject: string | undefined,
  email: string | undefined,
): string {
  if (typeof claims.idir_user_guid === 'string' && claims.idir_user_guid) {
    return claims.idir_user_guid;
  }
  if (typeof claims.bceid_user_guid === 'string' && claims.bceid_user_guid) {
    return claims.bceid_user_guid;
  }
  return subject || email || '';
}

/**
 * True when the session was signed in with a BCeID identity (CSS issues
 * `bceid_user_guid` for BCeID Basic/Business logins).
 */
export function isBceidIdentity(claims: Record<string, unknown>): boolean {
  return typeof claims.bceid_user_guid === 'string' && !!claims.bceid_user_guid;
}
