'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.extractTenantId = extractTenantId;
exports.resolveWilTenantProjectIds = resolveWilTenantProjectIds;
const headers_1 = require('../../constants/headers');
const regex_1 = require('../../constants/regex');
const errors_1 = require('../../utils/errors');
/**
 * Extracts and validates the tenant ID from the request header.
 * Returns the raw tenant ID string (UUID).
 */
function extractTenantId(req) {
  const tenantId = req.header(headers_1.X_TENANT_ID_HEADER)?.trim();
  if (!tenantId) {
    throw new errors_1.AppError(400, `Missing ${headers_1.X_TENANT_ID_HEADER} header`);
  }
  if (!regex_1.tenantUuidRegex.test(tenantId)) {
    throw new errors_1.AppError(400, `Invalid ${headers_1.X_TENANT_ID_HEADER} (expected UUID)`);
  }
  return tenantId;
}
async function resolveWilTenantProjectIds(req, tenantProjectRelationRepository) {
  const tenantId = extractTenantId(req);
  const projectIds = await tenantProjectRelationRepository.getProjectIdsByTenantId(tenantId);
  if (projectIds.length === 0) {
    throw new errors_1.AppError(403, 'No projects linked to this tenant. Please contact your tenant admin');
  }
  // TODO: Integrate CSTAR API for tenant access verification
  return { tenantId, projectIds };
}
