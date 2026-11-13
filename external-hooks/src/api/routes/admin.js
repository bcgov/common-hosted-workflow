"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAdminRouter = buildAdminRouter;
const express_1 = require("express");
const regex_1 = require("../constants/regex");
const admin_1 = require("../schemas/admin");
const responses_1 = require("./responses");
const errors_1 = require("../utils/errors");
const validation_1 = require("../utils/validation");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createLogger)('CustomAPIs');
function buildAdminRouter({ adminAuthMiddleware, n8nRepositories, customRepositories }) {
    const { user, project, workflow, credential, sharedWorkflow, sharedCredential, withTransaction } = n8nRepositories;
    const { tenantProjectRelation } = customRepositories;
    const router = (0, express_1.Router)();
    router.get('/users/:email/project', adminAuthMiddleware, (0, validation_1.createRequestSchemaValidator)(admin_1.getUserProjectSchema), async (req, res) => {
        const parsed = (0, validation_1.parseValidatedRequest)(admin_1.getUserProjectSchema, req);
        const { email } = parsed.params;
        const foundUser = await user.findByEmail(email);
        if (!foundUser) {
            log.warn('Target user not found', { statusCode: 404, email });
            throw new errors_1.AppError(404, 'Target user does not exist.');
        }
        const personalProject = await project.getPersonalProjectForUserOrFail(foundUser.id);
        (0, responses_1.OkResponse)(res, {
            user: foundUser,
            project: personalProject,
        }, admin_1.getUserProjectResponseSchema);
    });
    router.post('/associate-workflow', adminAuthMiddleware, (0, validation_1.createRequestSchemaValidator)(admin_1.associateWorkflowSchema), async (req, res) => {
        const parsed = (0, validation_1.parseValidatedRequest)(admin_1.associateWorkflowSchema, req);
        const { workflowId, projectId, singleOwner } = parsed.body;
        const [wf, proj] = await Promise.all([
            workflow.findOneBy({ id: workflowId }),
            project.findOneBy({ id: projectId }),
        ]);
        if (!wf) {
            log.warn('Workflow move failed: workflow not found', { statusCode: 404, workflowId });
            throw new errors_1.AppError(404, 'Workflow not found.');
        }
        if (!proj) {
            log.warn('Workflow move failed: project not found', { statusCode: 404, projectId });
            throw new errors_1.AppError(404, 'Project not found.');
        }
        await withTransaction(sharedWorkflow.manager, null, async (em) => {
            if (singleOwner)
                await em.delete('SharedWorkflow', { workflow: wf });
            const newShare = em.create('SharedWorkflow', {
                project: proj,
                workflow: wf,
                role: 'workflow:owner',
            });
            await em.save(newShare);
        });
        (0, responses_1.OkResponse)(res, {
            success: true,
            message: `Workflow '${workflowId}' successfully associated with project '${projectId}'`,
        }, admin_1.associateWorkflowResponseSchema);
    });
    router.post('/associate-credential', adminAuthMiddleware, (0, validation_1.createRequestSchemaValidator)(admin_1.associateCredentialSchema), async (req, res) => {
        const parsed = (0, validation_1.parseValidatedRequest)(admin_1.associateCredentialSchema, req);
        const { credentialId, projectId, singleOwner } = parsed.body;
        const [cred, proj] = await Promise.all([
            credential.findOneBy({ id: credentialId }),
            project.findOneBy({ id: projectId }),
        ]);
        if (!cred) {
            log.warn('Credential move failed: credential not found', { statusCode: 404, credentialId });
            throw new errors_1.AppError(404, 'Credential not found.');
        }
        if (!proj) {
            log.warn('Credential move failed: project not found', { statusCode: 404, projectId });
            throw new errors_1.AppError(404, 'Project not found.');
        }
        await withTransaction(sharedCredential.manager, null, async (em) => {
            if (singleOwner)
                await em.delete('SharedCredentials', { credentials: cred });
            const newShare = em.create('SharedCredentials', {
                project: proj,
                credentials: cred,
                role: 'credential:owner',
            });
            await em.save(newShare);
        });
        (0, responses_1.OkResponse)(res, {
            success: true,
            message: `Credential '${credentialId}' successfully associated with project '${projectId}'`,
        }, admin_1.associateCredentialResponseSchema);
    });
    router.post('/tenant-project-relation', adminAuthMiddleware, (0, validation_1.createRequestSchemaValidator)(admin_1.tenantProjectRelationSchema), async (req, res) => {
        const parsed = (0, validation_1.parseValidatedRequest)(admin_1.tenantProjectRelationSchema, req);
        const { tenantId, projectId } = parsed.body;
        if (!regex_1.tenantUuidRegex.test(tenantId)) {
            throw new errors_1.AppError(400, 'Invalid tenantId (expected UUID).');
        }
        const proj = await project.findOneBy({ id: projectId });
        if (!proj) {
            log.warn('Tenant-project relation insert failed: project not found', { statusCode: 404, projectId });
            throw new errors_1.AppError(404, 'Project not found.');
        }
        const existingTenantProjects = await tenantProjectRelation.getProjectIdsByTenantId(tenantId);
        if (existingTenantProjects.length > 0) {
            if (existingTenantProjects.includes(projectId)) {
                (0, responses_1.OkResponse)(res, { success: true, message: 'Relation already exists.' }, admin_1.tenantProjectExistsResponseSchema);
                return;
            }
            throw new errors_1.AppError(409, 'tenant already has a project mapping', {
                conflictProjectId: existingTenantProjects[0],
            });
        }
        const existingTenantForProject = await tenantProjectRelation.getTenantIdByProjectId(projectId);
        if (existingTenantForProject) {
            if (existingTenantForProject === tenantId) {
                (0, responses_1.OkResponse)(res, { success: true, message: 'Relation already exists.' }, admin_1.tenantProjectExistsResponseSchema);
                return;
            }
            throw new errors_1.AppError(409, 'projectId is already mapped to a different tenant', {
                conflictTenantId: existingTenantForProject,
            });
        }
        await tenantProjectRelation.insert({ tenantId, projectId });
        (0, responses_1.CreatedResponse)(res, {
            success: true,
            message: `Inserted tenant/project relation tenantId=${tenantId} projectId=${projectId}`,
        }, admin_1.tenantProjectCreatedResponseSchema);
    });
    return router;
}
