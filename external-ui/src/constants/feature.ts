/**
 * Canonical feature flag names. Use FEATURE.<key> instead of raw strings
 * to keep flag references traceable and refactor-safe.
 *
 * Must stay in sync with external-hooks/src/api/constants/feature-flag.ts
 */
export const FEATURE = {
  WIL: 'wil',
  PROJECT: 'project',
  WORKFLOW_SHARE: 'workflow-share',
  TENANT_PROJECT_SYNC: 'tenant-project-sync',
} as const;

export type FeatureName = (typeof FEATURE)[keyof typeof FEATURE];
