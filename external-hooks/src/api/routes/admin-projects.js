'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildAdminProjectRouter = buildAdminProjectRouter;
const express_1 = require('express');
const responses_1 = require('./responses');
const validation_1 = require('../utils/validation');
const projects_1 = require('../schemas/projects');
/**
 * Admin project-management sub-router (writes + defaults).
 * Shared read endpoints (list, detail, workflow usage, top-up history) live in
 * routes/projects.ts at /ui-api/projects for admins and members alike.
 * Restricted to users with global:admin or global:owner roles
 * (enforced by the parent router via requireUiRequestContext + checkRole).
 */
function buildAdminProjectRouter(routeContext) {
  const { services } = routeContext;
  const router = (0, express_1.Router)();
  // Literal-path defaults routes are kept ahead of the '/projects/:projectId/...'
  // routes below as a defensive convention: Express matches in registration
  // order, so a single-segment ':projectId' route added later cannot shadow
  // 'rate-limit-defaults'.
  router.get(
    '/projects/rate-limit-defaults',
    (0, validation_1.createRequestParser)(projects_1.getRateLimitDefaultsSchema),
    async (req, res) => {
      const result = await services.projectRateLimit.getRateLimitDefaults();
      (0, responses_1.OkResponse)(res, result);
    },
  );
  router.put(
    '/projects/rate-limit-defaults',
    (0, validation_1.createRequestParser)(projects_1.updateRateLimitDefaultsSchema),
    async (req, res) => {
      const updatedBy = req.session.n8nUser?.email ?? null;
      const result = await services.projectRateLimit.updateRateLimitDefaults(req.parsed.body, updatedBy);
      (0, responses_1.OkResponse)(res, { success: true, message: 'Default limits updated', defaults: result });
    },
  );
  // Admin run-request review endpoints. Literal paths are registered ahead of
  // the '/projects/:projectId/...' routes below, following the same
  // literal-first convention as the defaults routes.
  router.get(
    '/projects/run-requests',
    (0, validation_1.createRequestParser)(projects_1.listRunRequestsSchema),
    async (req, res) => {
      const result = await services.projectRateLimit.listRunRequestsForAdmin(req.parsed.query);
      (0, responses_1.OkResponse)(res, result);
    },
  );
  router.post(
    '/projects/run-requests/:requestId/approve',
    (0, validation_1.createRequestParser)(projects_1.approveRunRequestSchema),
    async (req, res) => {
      const { requestId } = req.parsed.params;
      const decidedBy = req.session.n8nUser?.email ?? null;
      const result = await services.projectRateLimit.approveRunRequest(requestId, req.parsed.body, decidedBy);
      (0, responses_1.OkResponse)(res, { success: true, message: 'Request approved', request: result });
    },
  );
  router.post(
    '/projects/run-requests/:requestId/deny',
    (0, validation_1.createRequestParser)(projects_1.denyRunRequestSchema),
    async (req, res) => {
      const { requestId } = req.parsed.params;
      const decidedBy = req.session.n8nUser?.email ?? null;
      const result = await services.projectRateLimit.denyRunRequest(requestId, req.parsed.body, decidedBy);
      (0, responses_1.OkResponse)(res, { success: true, message: 'Request denied', request: result });
    },
  );
  router.put(
    '/projects/:projectId/tenant',
    (0, validation_1.createRequestParser)(projects_1.updateProjectTenantSchema),
    async (req, res) => {
      const { projectId } = req.parsed.params;
      const { tenantId } = req.parsed.body;
      await services.projectTenant.assignTenantToProject(projectId, tenantId);
      (0, responses_1.OkResponse)(res, { success: true, message: 'Tenant assigned' });
    },
  );
  router.delete(
    '/projects/:projectId/tenant',
    (0, validation_1.createRequestParser)(projects_1.deleteProjectTenantSchema),
    async (req, res) => {
      const { projectId } = req.parsed.params;
      await services.projectTenant.removeTenantFromProject(projectId);
      res.status(204).end();
    },
  );
  router.put(
    '/projects/:projectId/rate-limit',
    (0, validation_1.createRequestParser)(projects_1.updateProjectRateLimitSchema),
    async (req, res) => {
      const { projectId } = req.parsed.params;
      const body = req.parsed.body;
      const updatedBy = req.session.n8nUser?.email ?? null;
      const result = await services.projectRateLimit.updateRateLimit(projectId, body, updatedBy);
      (0, responses_1.OkResponse)(res, { success: true, message: 'Rate limit updated', rateLimit: result });
    },
  );
  router.post(
    '/projects/:projectId/topups',
    (0, validation_1.createRequestParser)(projects_1.createProjectTopupSchema),
    async (req, res) => {
      const { projectId } = req.parsed.params;
      const body = req.parsed.body;
      const createdBy = req.session.n8nUser?.email ?? null;
      const result = await services.projectRateLimit.createProjectTopup(projectId, body, createdBy);
      (0, responses_1.OkResponse)(res, { success: true, message: 'Top-up added', topup: result });
    },
  );
  router.delete(
    '/projects/:projectId/topups/:topupId',
    (0, validation_1.createRequestParser)(projects_1.deleteProjectTopupSchema),
    async (req, res) => {
      const { projectId, topupId } = req.parsed.params;
      await services.projectRateLimit.deleteProjectTopup(projectId, topupId);
      res.status(204).end();
    },
  );
  return router;
}
