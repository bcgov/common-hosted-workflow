"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProjectsRouter = buildProjectsRouter;
const express_1 = require("express");
const responses_1 = require("./responses");
const validation_1 = require("../utils/validation");
const projects_1 = require("../schemas/projects");
/**
 * Shared project read endpoints, mounted at /ui-api/projects for admins and
 * non-admins alike (the parent router enforces requireUiRequestContext +
 * checkPermission('canManageProject')). Admins get every n8n project; members
 * get only the projects they can access in n8n, with identical payloads.
 * Write operations (limits, tenant mapping, top-ups, defaults) remain under
 * /ui-api/admin, where the admin role is enforced.
 */
function buildProjectsRouter(routeContext) {
    const { services } = routeContext;
    const router = (0, express_1.Router)();
    function isSessionAdmin(req) {
        return req.session.permissions.isAdmin === true;
    }
    function getSessionUserId(req) {
        return req.session.n8nUser?.id ?? '';
    }
    router.get('/', (0, validation_1.createRequestParser)(projects_1.adminProjectsQuerySchema), async (req, res) => {
        const { page, pageSize, search, type } = req.parsed.query;
        const result = isSessionAdmin(req)
            ? await services.projectTenant.listAllProjectsWithTenants(page, pageSize, { search, type })
            : await services.projectTenant.listProjectsWithTenantsForUser(page, pageSize, { search, type }, getSessionUserId(req));
        (0, responses_1.OkResponse)(res, result);
    });
    router.get('/:projectId', (0, validation_1.createRequestParser)(projects_1.getAdminProjectSchema), async (req, res) => {
        const { projectId } = req.parsed.params;
        if (!isSessionAdmin(req)) {
            await services.projectTenant.assertUserProjectAccess(projectId, getSessionUserId(req));
        }
        const result = await services.projectTenant.getProjectById(projectId, getSessionUserId(req));
        (0, responses_1.OkResponse)(res, result);
    });
    router.get('/:projectId/workflow-usage', (0, validation_1.createRequestParser)(projects_1.getProjectWorkflowUsageSchema), async (req, res) => {
        const { projectId } = req.parsed.params;
        if (!isSessionAdmin(req)) {
            await services.projectTenant.assertUserProjectAccess(projectId, getSessionUserId(req));
        }
        const result = await services.projectRateLimit.getProjectWorkflowUsage(projectId);
        (0, responses_1.OkResponse)(res, result);
    });
    router.get('/:projectId/topups', (0, validation_1.createRequestParser)(projects_1.listProjectTopupsSchema), async (req, res) => {
        const { projectId } = req.parsed.params;
        const { page, pageSize } = req.parsed.query;
        if (!isSessionAdmin(req)) {
            await services.projectTenant.assertUserProjectAccess(projectId, getSessionUserId(req));
        }
        const result = await services.projectRateLimit.listProjectTopups(projectId, page, pageSize);
        (0, responses_1.OkResponse)(res, result);
    });
    // Member "Request more runs" writes. Eligibility (project admins/editors and
    // personal owners — never platform admins without a relation) is enforced
    // inside the service via the project relation, so these routes stay shared:
    // members pass the access assertion, admins skip it but still hit the
    // membership gate.
    router.post('/:projectId/run-requests', (0, validation_1.createRequestParser)(projects_1.createRunRequestSchema), async (req, res) => {
        const { projectId } = req.parsed.params;
        if (!isSessionAdmin(req)) {
            await services.projectTenant.assertUserProjectAccess(projectId, getSessionUserId(req));
        }
        const request = await services.projectRateLimit.createRunRequest(projectId, getSessionUserId(req), req.parsed.body);
        (0, responses_1.CreatedResponse)(res, { success: true, message: 'Run request submitted', request });
    });
    router.delete('/:projectId/run-requests/:requestId', (0, validation_1.createRequestParser)(projects_1.cancelRunRequestSchema), async (req, res) => {
        const { projectId, requestId } = req.parsed.params;
        if (!isSessionAdmin(req)) {
            await services.projectTenant.assertUserProjectAccess(projectId, getSessionUserId(req));
        }
        await services.projectRateLimit.cancelRunRequest(projectId, requestId, getSessionUserId(req));
        res.status(204).end();
    });
    return router;
}
