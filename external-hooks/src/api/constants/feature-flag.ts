import { FEATURES_ENABLED } from '../../config';
import { parseFeatureFlagConfig } from '../helpers/config-resolver';

/**
 * Canonical feature flag names. Use FEATURE.<key> instead of raw strings
 * to keep flag references traceable and refactor-safe.
 */
export const FEATURE = {
  WIL: 'wil',
  PROJECT: 'project',
  WORKFLOW_SHARE: 'workflow-share',
  TENANT_PROJECT_SYNC: 'tenant-project-sync',
} as const;

export type FeatureName = (typeof FEATURE)[keyof typeof FEATURE];

export const FEATURE_FLAG_REGISTRY: Record<string, boolean> = parseFeatureFlagConfig(FEATURES_ENABLED);
