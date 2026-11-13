"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UiWorkflowSharingService = void 0;
const errors_1 = require("../utils/errors");
const workflow_1 = require("../helpers/workflow");
const SHAREABLE_PROJECT_ROLE_SLUGS = new Set(['project:owner', 'project:admin']);
function canViewAllWorkflows(roleSlug) {
    return roleSlug === 'global:owner' || roleSlug === 'global:admin';
}
function canShareWorkflows(roleSlug) {
    return roleSlug !== null && roleSlug !== undefined;
}
function getRoleSlug(role) {
    if (!role || typeof role !== 'object') {
        return null;
    }
    const slug = Reflect.get(role, 'slug');
    return typeof slug === 'string' ? slug : null;
}
class UiWorkflowSharingService {
    queryService;
    n8nRepositories;
    constructor(queryService, n8nRepositories) {
        this.queryService = queryService;
        this.n8nRepositories = n8nRepositories;
    }
    async shareWorkflow(email, workflowId, targetEmail) {
        const context = await this.requireManagingContext(email);
        const workflowRows = await this.queryService.loadWorkflowRows(workflowId);
        this.ensureWorkflowExists(workflowRows);
        this.ensureWorkflowVisibleToCaller(context, workflowRows);
        await this.ensureWorkflowShareableByCaller(context, workflowRows);
        const targetUser = await this.queryService.getWhoami(targetEmail);
        if (!targetUser) {
            throw new errors_1.AppError(404, 'Target user not found.');
        }
        const targetProject = await this.n8nRepositories.project.getPersonalProjectForUser(targetUser.id);
        if (!targetProject) {
            throw new errors_1.AppError(404, 'Target user has no personal project.');
        }
        const targetProjectAlreadyShared = workflowRows.some((row) => row.projectId === targetProject.id);
        if (targetProjectAlreadyShared) {
            throw new errors_1.AppError(409, 'Email is already associated with this workflow.');
        }
        const workflow = await this.n8nRepositories.workflow.findOneBy({ id: workflowId });
        const credentialIds = (0, workflow_1.extractCredentialIds)((0, workflow_1.getWorkflowNodes)(workflow));
        await this.n8nRepositories.withTransaction(this.n8nRepositories.sharedWorkflow.manager, null, async (tx) => {
            const newShare = this.n8nRepositories.sharedWorkflow.create({
                project: targetProject,
                workflow: { id: workflowId },
                role: 'workflow:owner',
            });
            await tx.save(newShare);
            if (credentialIds.length > 0) {
                await this.shareWorkflowCredentialsInTransaction(credentialIds, targetProject.id, tx);
            }
        });
        return {
            workflowId,
            sharedWithEmail: targetEmail,
        };
    }
    async unshareWorkflow(email, workflowId, projectId) {
        const context = await this.requireManagingContext(email);
        this.ensureWorkflowUnshareableByCaller(context);
        const workflowRows = await this.queryService.loadWorkflowRows(workflowId);
        this.ensureWorkflowExists(workflowRows);
        if (workflowRows.length <= 1) {
            throw new errors_1.AppError(409, 'Workflow must keep at least one project share.');
        }
        this.ensureWorkflowVisibleToCaller(context, workflowRows);
        const targetShare = workflowRows.find((row) => row.projectId === projectId);
        if (!targetShare) {
            throw new errors_1.AppError(404, 'Project is not associated with this workflow.');
        }
        const manager = this.n8nRepositories.sharedCredential.manager;
        await this.n8nRepositories.withTransaction(this.n8nRepositories.sharedWorkflow.manager, null, async (tx) => {
            await tx.delete('SharedWorkflow', { workflow: { id: workflowId }, project: { id: projectId } });
            await this.unshareWorkflowCredentialsIfUnused(workflowId, projectId, tx, manager);
        });
        return { workflowId, projectId };
    }
    async requireManagingContext(email) {
        const context = await this.queryService.loadUserContext(email);
        if (!context.n8nUser)
            throw new errors_1.AppError(401, 'Not authenticated.');
        // Disabled users must not share/unshare even when a stale role remains in the database.
        if (context.n8nUser.disabled)
            throw new errors_1.AppError(403, 'Sharing workflows is restricted to active users with a role.');
        if (!canShareWorkflows(context.n8nUser.role?.slug)) {
            throw new errors_1.AppError(403, 'Sharing workflows is restricted to active users with a role.');
        }
        return context;
    }
    async ensureWorkflowShareableByCaller(context, workflowRows) {
        if (canViewAllWorkflows(context.n8nUser.role?.slug)) {
            return;
        }
        const personalProject = await this.n8nRepositories.project.getPersonalProjectForUser(context.n8nUser.id);
        for (const projectId of new Set(workflowRows.map((row) => row.projectId))) {
            if (personalProject?.id === projectId) {
                return;
            }
            const projectRole = await this.n8nRepositories.projectRelation.findProjectRole({
                userId: context.n8nUser.id,
                projectId,
            });
            if (SHAREABLE_PROJECT_ROLE_SLUGS.has(getRoleSlug(projectRole) ?? '')) {
                return;
            }
        }
        throw new errors_1.AppError(403, 'Sharing this workflow is restricted to workflow admins.');
    }
    ensureWorkflowUnshareableByCaller(context) {
        if (!canViewAllWorkflows(context.n8nUser.role?.slug)) {
            throw new errors_1.AppError(403, 'Unsharing workflows is restricted to owner and admin users.');
        }
    }
    ensureWorkflowExists(workflowRows) {
        if (!workflowRows.length) {
            throw new errors_1.AppError(404, 'Workflow not found.');
        }
    }
    ensureWorkflowVisibleToCaller(context, workflowRows) {
        if (canViewAllWorkflows(context.n8nUser?.role?.slug))
            return;
        const hasAccess = workflowRows.some((row) => context.accessibleProjectIds.includes(row.projectId));
        if (!hasAccess) {
            throw new errors_1.AppError(403, 'Workflow is not accessible for this user.');
        }
    }
    async shareWorkflowCredentialsInTransaction(credentialIds, targetProjectId, tx) {
        if (!credentialIds.length)
            return;
        const existingRows = await this.n8nRepositories.sharedCredential.manager.query(`SELECT "credentialsId" FROM shared_credentials WHERE "projectId" = $1 AND "credentialsId" = ANY($2)`, [targetProjectId, credentialIds]);
        const existingIds = new Set(existingRows.map((r) => r.credentialsId));
        const newShares = credentialIds
            .filter((id) => !existingIds.has(id))
            .map((credentialsId) => ({
            credentialsId,
            projectId: targetProjectId,
            role: 'credential:owner',
        }));
        if (newShares.length === 0)
            return;
        const createdShares = newShares.map((share) => tx.create('SharedCredentials', share));
        await Promise.all(createdShares.map((share) => tx.save(share)));
    }
    async ensureCredentialsSharedWithProject(credentialIds, projectId) {
        if (!credentialIds.length)
            return;
        const existingRows = await this.n8nRepositories.sharedCredential.manager.query(`SELECT "credentialsId" FROM shared_credentials WHERE "projectId" = $1 AND "credentialsId" = ANY($2)`, [projectId, credentialIds]);
        const existingIds = new Set(existingRows.map((r) => r.credentialsId));
        const newShares = credentialIds
            .filter((id) => !existingIds.has(id))
            .map((credentialsId) => ({
            credentialsId,
            projectId,
            role: 'credential:owner',
        }));
        if (newShares.length === 0)
            return;
        const createdShares = newShares.map((share) => this.n8nRepositories.sharedCredential.create(share));
        await Promise.all(createdShares.map((share) => this.n8nRepositories.sharedCredential.save(share)));
    }
    async unshareWorkflowCredentialsIfUnused(workflowId, projectId, tx, manager) {
        const workflow = await this.n8nRepositories.workflow.findOneBy({ id: workflowId });
        const credentialIds = (0, workflow_1.extractCredentialIds)((0, workflow_1.getWorkflowNodes)(workflow));
        if (!credentialIds.length)
            return;
        const otherWorkflowRows = await this.n8nRepositories.sharedWorkflow.manager.query(`SELECT DISTINCT sw."workflowId"
       FROM shared_workflow sw
       INNER JOIN workflow_entity w ON w.id = sw."workflowId"
       WHERE sw."projectId" = $1
         AND sw."workflowId" != $2
         AND w.nodes IS NOT NULL`, [projectId, workflowId]);
        const otherWorkflowIds = otherWorkflowRows.map((r) => r.workflowId);
        const stillUsedCredentialIds = new Set();
        if (otherWorkflowIds.length > 0) {
            const otherWorkflows = await Promise.all(otherWorkflowIds.map((id) => this.n8nRepositories.workflow.findOneBy({ id })));
            for (const otherWorkflow of otherWorkflows) {
                const ids = (0, workflow_1.extractCredentialIds)((0, workflow_1.getWorkflowNodes)(otherWorkflow));
                if (ids.length) {
                    for (const id of ids)
                        stillUsedCredentialIds.add(id);
                }
            }
        }
        const credentialsToUnshare = credentialIds.filter((id) => !stillUsedCredentialIds.has(id));
        if (credentialsToUnshare.length === 0)
            return;
        const placeholders = credentialsToUnshare.map((_, i) => `$${i + 2}`).join(',');
        await manager.query(`DELETE FROM shared_credentials WHERE "projectId" = $1 AND "credentialsId" IN (${placeholders})`, [projectId, ...credentialsToUnshare]);
    }
}
exports.UiWorkflowSharingService = UiWorkflowSharingService;
