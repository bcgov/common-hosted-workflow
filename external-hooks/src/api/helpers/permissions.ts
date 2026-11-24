import type { FeatureFlagService } from '../services/feature-flag.service';
import type { TenantRole } from './ui-oidc-store';
import { FEATURE } from '../constants/feature-flag';
import { CSTAR_ROLE_UI_ACTOR } from '../constants/project-roles';

const ADMIN_ROLE_SLUGS = new Set(['global:owner', 'global:admin']);

type TenantRoleNames = Pick<TenantRole, 'roles'>;

function hasUiActorRole(tenantRoles: readonly TenantRoleNames[] | null): boolean {
  return (tenantRoles ?? []).some((entry) => entry.roles.includes(CSTAR_ROLE_UI_ACTOR));
}

export type Permissions = {
  isAdmin: boolean;
  canViewWorkflows: boolean;
  canRequestAccess: boolean;
  canReviewAccessRequests: boolean;
  canShareWorkflows: boolean;
  canUnshareWorkflows: boolean;
  canManageWil: boolean;
  canManageProject: boolean;
};

// Pure permission computation — single owner for permission + role checks.
// Disabled/role-less identities have no n8n capabilities; `checkRole` in ui-api.ts
// reuses the same disabled/role predicate so guards cannot drift.
//
// `tenantRoles` (CSTAR) only widens portal-side WIL access: a user holding `ui:actor`
// in any tenant may use Workflow Interaction even without an n8n identity. A disabled
// n8n user stays blocked regardless of CSTAR roles.
//
// `isBceidLogin` removes the access-request capability: approval provisions the user
// through an Azure IDIR lookup, so a BCeID request could never be approved. BCeID
// users get n8n access only through CSTAR `project:editor`/`project:viewer`.
export function computePermissions(
  n8nUser: { disabled: boolean; role: { slug: string } | null } | null,
  featureFlagService: FeatureFlagService,
  tenantRoles: readonly TenantRoleNames[] | null = null,
  isBceidLogin = false,
): Permissions {
  const isDisabled = n8nUser?.disabled ?? false;
  const hasNoRole = n8nUser?.role == null;
  // An identity is only n8n-authorized when an enabled user with an n8n role exists.
  // Disabled users and unprovisioned identities receive no n8n-derived capabilities.
  const isEligibleEnabledUser = !!n8nUser && !isDisabled && !hasNoRole;
  const isAdmin = !!n8nUser && !isDisabled && n8nUser.role != null && ADMIN_ROLE_SLUGS.has(n8nUser.role.slug);

  const canShareWorkflows = isEligibleEnabledUser && featureFlagService.isFeatureEnabled(FEATURE.WORKFLOW_SHARE);
  const isWilEnabled = featureFlagService.isFeatureEnabled(FEATURE.WIL);
  // Portal actor: no usable n8n identity needed, but only meaningful while WIL is on —
  // otherwise the user falls back to the access-request flow.
  const isPortalActor = !isDisabled && isWilEnabled && hasUiActorRole(tenantRoles);

  return {
    isAdmin,
    canViewWorkflows: canShareWorkflows,
    // Access-request creation/status is the default capability for disabled or
    // ineligible (missing/role-less) identities. Portal actors (`ui:actor` in
    // CSTAR) keep it so they can later request n8n access and a personal project.
    // BCeID logins never get it (see above).
    canRequestAccess: (isDisabled || hasNoRole) && !isBceidLogin,
    canReviewAccessRequests: isAdmin,
    canShareWorkflows,
    canUnshareWorkflows: isAdmin,
    canManageWil: (isEligibleEnabledUser || isPortalActor) && isWilEnabled,
    canManageProject: isEligibleEnabledUser && featureFlagService.isFeatureEnabled(FEATURE.PROJECT),
  };
}
