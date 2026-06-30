/**
 * Resolved actor identifiers for multi-type matching in WIL queries.
 *
 * Used by the WIL routes to match messages/actions assigned to a user
 * via their email (user), their CSTAR roles, or their CSTAR groups.
 */
export type ActorMatchers = {
  /** User email — matches actor_type = 'user' */
  userId: string;
  /** Keycloak subject — legacy fallback for actor_type = 'user' */
  userFallback: string;
  /** Role names from CSTAR groups' sharedServiceRoles — matches actor_type = 'role' */
  roleNames: string[];
  /** Group names from CSTAR — matches actor_type = 'group' */
  groupNames: string[];
};
