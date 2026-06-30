/**
 * Shared helpers to build the token and user objects that the CHEFS form viewer expects,
 * derived from OIDC claims present in the user's session.
 */

export function buildTokenObject(claims: Record<string, unknown>): Record<string, unknown> {
  return {
    sub: claims.sub,
    roles: claims.client_roles ?? [],
    email: claims.email,
    idp: claims.identity_provider,
  };
}

export function buildUserObject(claims: Record<string, unknown>): Record<string, unknown> {
  return {
    name: claims.display_name,
    firstName: claims.given_name,
    lastName: claims.family_name,
    email: claims.email,
    username: claims.idir_username ?? claims.preferred_username,
    idp: claims.identity_provider,
  };
}

/**
 * Builds a flat user-profile object used to pre-fill CHEFS form fields
 * (only needed in the WIL action-handler flow).
 */
export function buildUserProfile(claims: Record<string, unknown>): Record<string, unknown> {
  return {
    idpUserId: claims.idir_user_guid,
    username: claims.idir_username,
    firstName: claims.given_name,
    lastName: claims.family_name,
    fullName: claims.display_name,
    email: claims.email,
    idp: claims.identity_provider,
  };
}
