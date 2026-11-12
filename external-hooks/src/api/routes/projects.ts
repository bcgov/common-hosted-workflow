import { Router } from 'express';
import { type infer as zInfer } from 'zod';
import { CreatedResponse, OkResponse } from './responses';
import type { ApiRouteContext } from '../types/routes';
import type { UiApiRequest, UiApiTypedRequest } from '../types/ui-api';
import { createRequestParser } from '../utils/validation';
import {
  adminProjectsQuerySchema,
  cancelRunRequestSchema,
  createRunRequestSchema,
  getAdminProjectSchema,
  getProjectWorkflowUsageSchema,
  listProjectTopupsSchema,
} from '../schemas/projects';

/**
 * Shared project read endpoints, mounted at /ui-api/projects for admins and
 * non-admins alike (the parent router enforces requireUiRequestContext +
 * checkPermission('canManageProject')). Admins get every n8n project; members
 * get only the projects they can access in n8n, with identical payloads.
 * Write operations (limits, tenant mapping, top-ups, defaults) remain under
 * /ui-api/admin, where the admin role is enforced.
 */
export function buildProjectsRouter(routeContext: ApiRouteContext) {
  const { services } = routeContext;
  const router = Router();

  function isSessionAdmin(req: UiApiRequest): boolean {
    return req.session.permissions.isAdmin === true;
  }

  function getSessionUserId(req: UiApiRequest): string {
    return req.session.n8nUser?.id ?? '';
  }

  router.get(
    '/',
    createRequestParser(adminProjectsQuerySchema),
    async (req: UiApiTypedRequest<zInfer<typeof adminProjectsQuerySchema>>, res) => {
      const { page, pageSize, search, type } = req.parsed.query;
      const result = isSessionAdmin(req)
        ? await services.projectTenant.listAllProjectsWithTenants(page, pageSize, { search, type })
        : await services.projectTenant.listProjectsWithTenantsForUser(
            page,
            pageSize,
            { search, type },
            getSessionUserId(req),
          );
      OkResponse(res, result);
    },
  );

  router.get(
    '/:projectId',
    createRequestParser(getAdminProjectSchema),
    async (req: UiApiTypedRequest<zInfer<typeof getAdminProjectSchema>>, res) => {
      const { projectId } = req.parsed.params;
      if (!isSessionAdmin(req)) {
        await services.projectTenant.assertUserProjectAccess(projectId, getSessionUserId(req));
      }
      const result = await services.projectTenant.getProjectById(projectId, getSessionUserId(req));
      OkResponse(res, result);
    },
  );

  router.get(
    '/:projectId/workflow-usage',
    createRequestParser(getProjectWorkflowUsageSchema),
    async (req: UiApiTypedRequest<zInfer<typeof getProjectWorkflowUsageSchema>>, res) => {
      const { projectId } = req.parsed.params;
      if (!isSessionAdmin(req)) {
        await services.projectTenant.assertUserProjectAccess(projectId, getSessionUserId(req));
      }
      const result = await services.projectRateLimit.getProjectWorkflowUsage(projectId);
      OkResponse(res, result);
    },
  );

  router.get(
    '/:projectId/topups',
    createRequestParser(listProjectTopupsSchema),
    async (req: UiApiTypedRequest<zInfer<typeof listProjectTopupsSchema>>, res) => {
      const { projectId } = req.parsed.params;
      const { page, pageSize } = req.parsed.query;
      if (!isSessionAdmin(req)) {
        await services.projectTenant.assertUserProjectAccess(projectId, getSessionUserId(req));
      }
      const result = await services.projectRateLimit.listProjectTopups(projectId, page, pageSize);
      OkResponse(res, result);
    },
  );

  // Member "Request more runs" writes. Eligibility (project admins/editors and
  // personal owners — never platform admins without a relation) is enforced
  // inside the service via the project relation, so these routes stay shared:
  // members pass the access assertion, admins skip it but still hit the
  // membership gate.
  router.post(
    '/:projectId/run-requests',
    createRequestParser(createRunRequestSchema),
    async (req: UiApiTypedRequest<zInfer<typeof createRunRequestSchema>>, res) => {
      const { projectId } = req.parsed.params;
      if (!isSessionAdmin(req)) {
        await services.projectTenant.assertUserProjectAccess(projectId, getSessionUserId(req));
      }
      const request = await services.projectRateLimit.createRunRequest(
        projectId,
        getSessionUserId(req),
        req.parsed.body,
      );
      CreatedResponse(res, { success: true, message: 'Run request submitted', request });
    },
  );

  router.delete(
    '/:projectId/run-requests/:requestId',
    createRequestParser(cancelRunRequestSchema),
    async (req: UiApiTypedRequest<zInfer<typeof cancelRunRequestSchema>>, res) => {
      const { projectId, requestId } = req.parsed.params;
      if (!isSessionAdmin(req)) {
        await services.projectTenant.assertUserProjectAccess(projectId, getSessionUserId(req));
      }
      await services.projectRateLimit.cancelRunRequest(projectId, requestId, getSessionUserId(req));
      res.status(204).end();
    },
  );

  return router;
}
