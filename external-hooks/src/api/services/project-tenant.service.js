"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectTenantService = void 0;
const project_access_1 = require("./project-access");
const errors_1 = require("../utils/errors");
class ProjectTenantService {
    n8nRepositories;
    customRepositories;
    projectRateLimitService;
    constructor(n8nRepositories, customRepositories, projectRateLimitService) {
        this.n8nRepositories = n8nRepositories;
        this.customRepositories = customRepositories;
        this.projectRateLimitService = projectRateLimitService;
    }
    /**
     * Lists all n8n projects with their tenant mappings, paginated.
     * Merges project data from n8n with tenant-project relations from the custom DB.
     */
    async listAllProjectsWithTenants(page, pageSize, filters) {
        const { projects, totalCount } = await this.n8nRepositories.project.listPaginated(page, pageSize, filters);
        return this.buildProjectPage(projects, page, pageSize, totalCount);
    }
    /**
     * Lists only the n8n projects the user can access (their personal project and
     * team project relations), with the same shape as the admin list. Members of
     * no project get an empty page.
     */
    async listProjectsWithTenantsForUser(page, pageSize, filters, userId) {
        const accessibleIds = await (0, project_access_1.listProjectIdsAccessibleToUser)(this.n8nRepositories.project, this.n8nRepositories.projectRelation, userId);
        const { projects, totalCount } = await this.n8nRepositories.project.listPaginated(page, pageSize, {
            ...filters,
            ids: accessibleIds,
        });
        return this.buildProjectPage(projects, page, pageSize, totalCount);
    }
    /**
     * Returns a single project item with the same shape as one list entry, plus
     * `viewerRole` — the requesting user's membership role for role-scoped UI
     * (request-more-runs affordances). Throws AppError 404 when the project does
     * not exist in n8n. Callers are responsible for access control (admins by
     * role; members via `assertUserProjectAccess` first).
     */
    async getProjectById(projectId, viewerUserId) {
        const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
        if (!project) {
            throw new errors_1.AppError(404, 'Project not found');
        }
        const tenantMap = await this.customRepositories.tenantProjectRelation.listAll();
        const rateLimitEnrichment = await this.projectRateLimitService.enrichProjectsWithRateLimits([
            { projectId, projectType: project.type },
        ]);
        const viewerRole = viewerUserId
            ? await (0, project_access_1.getViewerProjectRole)(this.n8nRepositories.project, this.n8nRepositories.projectRelation, viewerUserId, projectId)
            : null;
        // Fail-open (the summary method catches its own errors): the review panel
        // is an addition to the payload, never a reason to lose the detail page.
        const pendingRunRequest = await this.projectRateLimitService.getPendingRunRequest(projectId);
        return {
            projectId: project.id,
            projectName: project.name,
            projectType: project.type,
            tenantId: tenantMap.get(project.id) ?? null,
            ...rateLimitEnrichment[project.id],
            pendingRunRequest,
            viewerRole,
        };
    }
    /**
     * Ensures the project exists in n8n and that the user may see it (a project
     * relation row, or ownership of the personal project). Throws AppError 404
     * for an unknown project and AppError 403 when the user has no access.
     */
    async assertUserProjectAccess(projectId, userId) {
        const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
        if (!project) {
            throw new errors_1.AppError(404, 'Project not found');
        }
        const hasAccess = await (0, project_access_1.verifyCallerHasN8nProjectAccess)(this.n8nRepositories.project, this.n8nRepositories.projectRelation, userId, projectId);
        if (!hasAccess) {
            throw new errors_1.AppError(403, 'You do not have access to this project');
        }
    }
    /**
     * Assigns a tenant ID to a project. Validates that the project exists and that
     * the tenant is not already assigned to a different project.
     * Throws AppError 404 if project not found, 409 if tenant conflict.
     */
    async assignTenantToProject(projectId, tenantId) {
        const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
        if (!project) {
            throw new errors_1.AppError(404, 'Project not found');
        }
        // Check if the tenantId is already assigned to a different project
        const tenantMap = await this.customRepositories.tenantProjectRelation.listAll();
        for (const [existingProjectId, existingTenantId] of tenantMap) {
            if (existingTenantId === tenantId && existingProjectId !== projectId) {
                throw new errors_1.AppError(409, 'Tenant ID is already assigned to another project', {
                    conflictProjectId: existingProjectId,
                });
            }
        }
        const projectType = project.type === 'personal' ? 'personal' : 'team';
        await this.customRepositories.tenantProjectRelation.upsertByProjectId({ tenantId, projectId, projectType });
    }
    /**
     * Removes the tenant mapping from a project.
     * Throws AppError 404 if the project does not exist.
     */
    async removeTenantFromProject(projectId) {
        const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
        if (!project) {
            throw new errors_1.AppError(404, 'Project not found');
        }
        await this.customRepositories.tenantProjectRelation.deleteByProjectId(projectId);
    }
    /**
     * Merges project rows with tenant mappings and batched rate-limit enrichment
     * into one page. Shared by the admin (all projects) and user-scoped lists.
     */
    async buildProjectPage(projects, page, pageSize, totalCount) {
        const tenantMap = await this.customRepositories.tenantProjectRelation.listAll();
        // Batched rate-limit enrichment keyed by projectId; falls back to defaults
        // (default mode, null limits, zero counts) when the custom DB is unavailable.
        const rateLimitEnrichment = await this.projectRateLimitService.enrichProjectsWithRateLimits(projects.map((p) => ({ projectId: p.id, projectType: p.type })));
        const data = projects.map((p) => ({
            projectId: p.id,
            projectName: p.name,
            projectType: p.type,
            tenantId: tenantMap.get(p.id) ?? null,
            ...rateLimitEnrichment[p.id],
        }));
        return {
            data,
            pagination: {
                page,
                pageSize,
                totalItems: totalCount,
                totalPages: Math.ceil(totalCount / pageSize),
            },
        };
    }
}
exports.ProjectTenantService = ProjectTenantService;
