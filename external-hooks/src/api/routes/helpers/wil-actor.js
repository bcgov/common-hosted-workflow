'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.resolveActorMatchers = resolveActorMatchers;
/**
 * Resolves actor matchers for the current user session within a specific tenant.
 *
 * Extracts:
 * - userId: the user's email (matches actor_type = 'user')
 * - userFallback: the Keycloak subject (legacy fallback for actor_type = 'user')
 * - roleNames: shared service role names from the user's groups in this tenant
 * - groupNames: group names the user belongs to in this tenant
 */
function resolveActorMatchers(session, tenantId) {
  const tenantRoleEntry = session.tenantRoles.find((tr) => tr.tenantId === tenantId);
  const tenantGroupEntry = session.tenantGroups.find((tg) => tg.tenantId === tenantId);
  return {
    userId: session.email,
    userFallback: session.subject,
    roleNames: tenantRoleEntry?.roles ?? [],
    groupNames: tenantGroupEntry?.groups ?? [],
  };
}
