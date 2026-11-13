'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getTenantScopedProjectIds = getTenantScopedProjectIds;
const project_access_1 = require('../../services/project-access');
function getTenantScopedProjectIds(res, routeLabel, logDomain) {
  return (0, project_access_1.requireChwfAllowedProjectIds)(res, routeLabel, logDomain);
}
