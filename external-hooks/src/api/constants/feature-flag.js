'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.FEATURE_FLAG_REGISTRY = exports.FEATURE = void 0;
const config_1 = require('../../config');
const config_resolver_1 = require('../helpers/config-resolver');
/**
 * Canonical feature flag names. Use FEATURE.<key> instead of raw strings
 * to keep flag references traceable and refactor-safe.
 */
exports.FEATURE = {
  WIL: 'wil',
  PROJECT: 'project',
  WORKFLOW_SHARE: 'workflow-share',
  TENANT_PROJECT_SYNC: 'tenant-project-sync',
};
exports.FEATURE_FLAG_REGISTRY = (0, config_resolver_1.parseFeatureFlagConfig)(config_1.FEATURES_ENABLED);
