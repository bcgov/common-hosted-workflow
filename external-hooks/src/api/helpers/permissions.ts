import type { FeatureFlagService } from '../services/feature-flag.service';
import { FEATURE } from '../constants/feature-flag';

const ADMIN_ROLE_SLUGS = new Set(['global:owner', 'global:admin']);

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

// AUTH-07: Pure permission computation — single owner for permission + role checks.
// Disabled/role-less identities have no n8n capabilities; `checkRole` in ui-api.ts
// reuses the same disabled/role predicate so guards cannot drift.
export function computePermissions(
  n8nUser: { disabled: boolean; role: { slug: string } | null } | null,
  featureFlagService: FeatureFlagService,
): Permissions {
  const isDisabled = n8nUser?.disabled ?? false;
  const hasNoRole = n8nUser?.role == null;
  // An identity is only n8n-authorized when an enabled user with an n8n role exists.
  // Disabled users and unprovisioned identities receive no n8n-derived capabilities.
  const isEligibleEnabledUser = !!n8nUser && !isDisabled && !hasNoRole;
  const isAdmin = !!n8nUser && !isDisabled && n8nUser.role != null && ADMIN_ROLE_SLUGS.has(n8nUser.role.slug);

  const canShareWorkflows = isEligibleEnabledUser && featureFlagService.isFeatureEnabled(FEATURE.WORKFLOW_SHARE);

  return {
    isAdmin,
    canViewWorkflows: canShareWorkflows,
    // Access-request creation/status is the only default capability for
    // disabled or ineligible (missing/role-less) identities.
    canRequestAccess: isDisabled || hasNoRole,
    canReviewAccessRequests: isAdmin,
    canShareWorkflows,
    canUnshareWorkflows: isAdmin,
    canManageWil: isEligibleEnabledUser && featureFlagService.isFeatureEnabled(FEATURE.WIL),
    canManageProject: isEligibleEnabledUser && featureFlagService.isFeatureEnabled(FEATURE.PROJECT),
  };
}
