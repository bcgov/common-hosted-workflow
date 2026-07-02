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
  if (!n8nUser) {
    return {
      isAdmin: false,
      canViewWorkflows: false,
      canRequestAccess: true,
      canReviewAccessRequests: false,
      canShareWorkflows: false,
      canUnshareWorkflows: false,
      canManageWil: false,
      canManageProject: false,
    };
  }

  const isAdmin = n8nUser.role != null && ADMIN_ROLE_SLUGS.has(n8nUser.role.slug);
  const hasNoRole = n8nUser.role == null;
  const isDisabled = n8nUser.disabled;

  const isWorkflowShareEnabled = featureFlagService.isFeatureEnabled(FEATURE.WORKFLOW_SHARE);
  const userIsValid = !isDisabled && !hasNoRole;

  const isWilEnabled = featureFlagService.isFeatureEnabled(FEATURE.WIL);
  const isProjectEnabled = featureFlagService.isFeatureEnabled(FEATURE.PROJECT);

  return {
    isAdmin,
    canViewWorkflows: isWorkflowShareEnabled && userIsValid,
    canRequestAccess: isDisabled || hasNoRole,
    canReviewAccessRequests: isAdmin,
    canShareWorkflows: isWorkflowShareEnabled && userIsValid,
    canUnshareWorkflows: isAdmin,
    canManageWil: isWilEnabled,
    canManageProject: isProjectEnabled,
  };
}
