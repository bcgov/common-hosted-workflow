import { CSTAR_WORKFLOW_SERVICE_ROLES_RAW } from '@config';

/**
 * CSTAR shared-service roles for the Workflow Service.
 * Parsed from the CSTAR_WORKFLOW_SERVICE_ROLES env var (comma-separated).
 * Fallback to default roles if env var is not set.
 */
export const CSTAR_WORKFLOW_SERVICE_ROLES: readonly string[] = (() => {
  if (!CSTAR_WORKFLOW_SERVICE_ROLES_RAW.trim()) {
    return ['project:editor', 'project:viewer', 'ui:actor'];
  }
  return CSTAR_WORKFLOW_SERVICE_ROLES_RAW.split(',').map((r) => r.trim()).filter(Boolean);
})();
