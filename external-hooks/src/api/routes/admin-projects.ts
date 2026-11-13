import { Router } from 'express';
import { type infer as zInfer } from 'zod';
import { OkResponse } from './responses';
import type { ApiRouteContext } from '../types/routes';
import { createRequestParser } from '../utils/validation';
import {
  updateProjectTenantSchema,
  deleteProjectTenantSchema,
  updateProjectRateLimitSchema,
  createProjectTopupSchema,
  deleteProjectTopupSchema,
  getRateLimitDefaultsSchema,
  updateRateLimitDefaultsSchema,
  listRunRequestsSchema,
  approveRunRequestSchema,
  denyRunRequestSchema,
} from '../schemas/projects';
import type { UiApiTypedRequest } from '../types/ui-api';

/**
 * Admin project-management sub-router (writes + defaults).
 * Shared read endpoints (list, detail, workflow usage, top-up history) live in
 * routes/projects.ts at /ui-api/projects for admins and members alike.
 * Restricted to users with global:admin or global:owner roles
 * (enforced by the parent router via requireUiRequestContext + checkRole).
 */
export function buildAdminProjectRouter(routeContext: ApiRouteContext) {
  const { services } = routeContext;
  const router = Router();

  // Literal-path defaults routes are kept ahead of the '/projects/:projectId/...'
  // routes below as a defensive convention: Express matches in registration
  // order, so a single-segment ':projectId' route added later cannot shadow
  // 'rate-limit-defaults'.
  router.get(
    '/projects/rate-limit-defaults',
    createRequestParser(getRateLimitDefaultsSchema),
    async (req: UiApiTypedRequest<zInfer<typeof getRateLimitDefaultsSchema>>, res) => {
      const result = await services.projectRateLimit.getRateLimitDefaults();
      OkResponse(res, result);
    },
  );

  router.put(
    '/projects/rate-limit-defaults',
    createRequestParser(updateRateLimitDefaultsSchema),
    async (req: UiApiTypedRequest<zInfer<typeof updateRateLimitDefaultsSchema>>, res) => {
      const updatedBy = req.session.n8nUser?.email ?? null;
      const result = await services.projectRateLimit.updateRateLimitDefaults(req.parsed.body, updatedBy);
      OkResponse(res, { success: true, message: 'Default limits updated', defaults: result });
    },
  );

  // Admin run-request review endpoints. Literal paths are registered ahead of
  // the '/projects/:projectId/...' routes below, following the same
  // literal-first convention as the defaults routes.
  router.get(
    '/projects/run-requests',
    createRequestParser(listRunRequestsSchema),
    async (req: UiApiTypedRequest<zInfer<typeof listRunRequestsSchema>>, res) => {
      const result = await services.projectRateLimit.listRunRequestsForAdmin(req.parsed.query);
      OkResponse(res, result);
    },
  );

  router.post(
    '/projects/run-requests/:requestId/approve',
    createRequestParser(approveRunRequestSchema),
    async (req: UiApiTypedRequest<zInfer<typeof approveRunRequestSchema>>, res) => {
      const { requestId } = req.parsed.params;
      const decidedBy = req.session.n8nUser?.email ?? null;
      const result = await services.projectRateLimit.approveRunRequest(requestId, req.parsed.body, decidedBy);
      OkResponse(res, { success: true, message: 'Request approved', request: result });
    },
  );

  router.post(
    '/projects/run-requests/:requestId/deny',
    createRequestParser(denyRunRequestSchema),
    async (req: UiApiTypedRequest<zInfer<typeof denyRunRequestSchema>>, res) => {
      const { requestId } = req.parsed.params;
      const decidedBy = req.session.n8nUser?.email ?? null;
      const result = await services.projectRateLimit.denyRunRequest(requestId, req.parsed.body, decidedBy);
      OkResponse(res, { success: true, message: 'Request denied', request: result });
    },
  );

  router.put(
    '/projects/:projectId/tenant',
    createRequestParser(updateProjectTenantSchema),
    async (req: UiApiTypedRequest<zInfer<typeof updateProjectTenantSchema>>, res) => {
      const { projectId } = req.parsed.params;
      const { tenantId } = req.parsed.body;
      await services.projectTenant.assignTenantToProject(projectId, tenantId);
      OkResponse(res, { success: true, message: 'Tenant assigned' });
    },
  );

  router.delete(
    '/projects/:projectId/tenant',
    createRequestParser(deleteProjectTenantSchema),
    async (req: UiApiTypedRequest<zInfer<typeof deleteProjectTenantSchema>>, res) => {
      const { projectId } = req.parsed.params;
      await services.projectTenant.removeTenantFromProject(projectId);
      res.status(204).end();
    },
  );

  router.put(
    '/projects/:projectId/rate-limit',
    createRequestParser(updateProjectRateLimitSchema),
    async (req: UiApiTypedRequest<zInfer<typeof updateProjectRateLimitSchema>>, res) => {
      const { projectId } = req.parsed.params;
      const body = req.parsed.body;
      const updatedBy = req.session.n8nUser?.email ?? null;
      const result = await services.projectRateLimit.updateRateLimit(projectId, body, updatedBy);
      OkResponse(res, { success: true, message: 'Rate limit updated', rateLimit: result });
    },
  );

  router.post(
    '/projects/:projectId/topups',
    createRequestParser(createProjectTopupSchema),
    async (req: UiApiTypedRequest<zInfer<typeof createProjectTopupSchema>>, res) => {
      const { projectId } = req.parsed.params;
      const body = req.parsed.body;
      const createdBy = req.session.n8nUser?.email ?? null;
      const result = await services.projectRateLimit.createProjectTopup(projectId, body, createdBy);
      OkResponse(res, { success: true, message: 'Top-up added', topup: result });
    },
  );

  router.delete(
    '/projects/:projectId/topups/:topupId',
    createRequestParser(deleteProjectTopupSchema),
    async (req: UiApiTypedRequest<zInfer<typeof deleteProjectTopupSchema>>, res) => {
      const { projectId, topupId } = req.parsed.params;
      await services.projectRateLimit.deleteProjectTopup(projectId, topupId);
      res.status(204).end();
    },
  );

  return router;
}
