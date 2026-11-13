'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.computePermissions = computePermissions;
const feature_flag_1 = require('../constants/feature-flag');
const ADMIN_ROLE_SLUGS = new Set(['global:owner', 'global:admin']);
// Pure permission computation — single owner for permission + role checks.
// Disabled/role-less identities have no n8n capabilities; `checkRole` in ui-api.ts
// reuses the same disabled/role predicate so guards cannot drift.
function computePermissions(n8nUser, featureFlagService) {
  const isDisabled = n8nUser?.disabled ?? false;
  const hasNoRole = n8nUser?.role == null;
  // An identity is only n8n-authorized when an enabled user with an n8n role exists.
  // Disabled users and unprovisioned identities receive no n8n-derived capabilities.
  const isEligibleEnabledUser = !!n8nUser && !isDisabled && !hasNoRole;
  const isAdmin = !!n8nUser && !isDisabled && n8nUser.role != null && ADMIN_ROLE_SLUGS.has(n8nUser.role.slug);
  const canShareWorkflows =
    isEligibleEnabledUser && featureFlagService.isFeatureEnabled(feature_flag_1.FEATURE.WORKFLOW_SHARE);
  return {
    isAdmin,
    canViewWorkflows: canShareWorkflows,
    // Access-request creation/status is the only default capability for
    // disabled or ineligible (missing/role-less) identities.
    canRequestAccess: isDisabled || hasNoRole,
    canReviewAccessRequests: isAdmin,
    canShareWorkflows,
    canUnshareWorkflows: isAdmin,
    canManageWil: isEligibleEnabledUser && featureFlagService.isFeatureEnabled(feature_flag_1.FEATURE.WIL),
    canManageProject: isEligibleEnabledUser && featureFlagService.isFeatureEnabled(feature_flag_1.FEATURE.PROJECT),
  };
}
