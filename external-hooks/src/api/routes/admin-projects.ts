import { Router } from 'express';
import { type infer as zInfer } from 'zod';
import { OkResponse } from './responses';
import type { ApiRouteContext } from '../types/routes';
import { createRequestParser } from '../utils/validation';
import {
  adminProjectsQuerySchema,
  updateProjectTenantSchema,
  deleteProjectTenantSchema,
  updateProjectRateLimitSchema,
  getAdminProjectSchema,
  getProjectWorkflowUsageSchema,
} from '../schemas/projects';
import type { UiApiTypedRequest } from '../types/ui-api';

/**
 * Admin project-tenant management sub-router.
 * Used for listing all n8n projects and managing tenant mappings.
 * Restricted to users with global:admin or global:owner roles
 * (enforced by the parent router via requireUiRequestContext + checkRole).
 */
export function buildAdminProjectRouter(routeContext: ApiRouteContext) {
  const { services } = routeContext;
  const router = Router();

  router.get(
    '/projects',
    createRequestParser(adminProjectsQuerySchema),
    async (req: UiApiTypedRequest<zInfer<typeof adminProjectsQuerySchema>>, res) => {
      const { page, pageSize, search, type } = req.parsed.query;
      const result = await services.projectTenant.listAllProjectsWithTenants(page, pageSize, { search, type });
      OkResponse(res, result);
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

  router.get(
    '/projects/:projectId',
    createRequestParser(getAdminProjectSchema),
    async (req: UiApiTypedRequest<zInfer<typeof getAdminProjectSchema>>, res) => {
      const { projectId } = req.parsed.params;
      const result = await services.projectTenant.getAdminProjectById(projectId);
      OkResponse(res, result);
    },
  );

  router.get(
    '/projects/:projectId/workflow-usage',
    createRequestParser(getProjectWorkflowUsageSchema),
    async (req: UiApiTypedRequest<zInfer<typeof getProjectWorkflowUsageSchema>>, res) => {
      const { projectId } = req.parsed.params;
      const result = await services.projectRateLimit.getProjectWorkflowUsage(projectId);
      OkResponse(res, result);
    },
  );

  return router;
}
