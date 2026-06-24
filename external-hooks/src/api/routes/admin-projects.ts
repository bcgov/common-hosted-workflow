import { Router } from 'express';
import { type infer as zInfer } from 'zod';
import { OkResponse } from './responses';
import type { ApiRouteContext } from '../types/routes';
import { createRequestParser } from '../utils/validation';
import { adminProjectsQuerySchema, updateProjectTenantSchema, deleteProjectTenantSchema } from '../schemas/projects';
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
      const { page, pageSize } = req.parsed.query;
      const result = await services.projectTenant.listAllProjectsWithTenants(page, pageSize);
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

  return router;
}
