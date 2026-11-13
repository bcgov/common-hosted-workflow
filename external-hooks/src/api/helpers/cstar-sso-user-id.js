'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.resolveCstarSsoUserId = resolveCstarSsoUserId;
/**
 * Resolves the CSTAR SSO user ID from OIDC claims.
 *
 * CSTAR expects the IDP user GUID (e.g. idir_user_guid or bceid_user_guid),
 * not the Keycloak subject. Falls back to subject, then email.
 */
function resolveCstarSsoUserId(claims, subject, email) {
  if (typeof claims.idir_user_guid === 'string' && claims.idir_user_guid) {
    return claims.idir_user_guid;
  }
  if (typeof claims.bceid_user_guid === 'string' && claims.bceid_user_guid) {
    return claims.bceid_user_guid;
  }
  return subject || email || '';
}
