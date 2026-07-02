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

export function computePermissions(
  n8nUser: { disabled: boolean; role: { slug: string } | null } | null,
  featureFlagService: FeatureFlagService,
): Permissions {
  const isAdmin = n8nUser?.role != null && ADMIN_ROLE_SLUGS.has(n8nUser.role.slug);
  const hasNoRole = n8nUser?.role == null;
  const isDisabled = n8nUser?.disabled ?? false;
  const userIsValid = !!n8nUser && !isDisabled && !hasNoRole;

  const canShareWorkflows = userIsValid && featureFlagService.isFeatureEnabled(FEATURE.WORKFLOW_SHARE);

  return {
    isAdmin,
    canViewWorkflows: canShareWorkflows,
    canRequestAccess: isDisabled || hasNoRole,
    canReviewAccessRequests: isAdmin,
    canShareWorkflows,
    canUnshareWorkflows: isAdmin,
    canManageWil: !!n8nUser && featureFlagService.isFeatureEnabled(FEATURE.WIL),
    canManageProject: !!n8nUser && featureFlagService.isFeatureEnabled(FEATURE.PROJECT),
  };
}
