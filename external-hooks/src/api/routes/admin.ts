import { Request, Response, Router } from 'express';
import { tenantUuidRegex } from '../constants/regex';
import {
  associateWorkflowResponseSchema,
  associateCredentialResponseSchema,
  associateWorkflowSchema,
  associateCredentialSchema,
  getUserProjectResponseSchema,
  getUserProjectSchema,
  tenantProjectCreatedResponseSchema,
  tenantProjectExistsResponseSchema,
  tenantProjectRelationSchema,
} from '../schemas/admin';
import type { ApiRouteContext } from '../types/routes';
import { AppError, wrapAsyncRoute } from '../utils/errors';
import { createRequestSchemaValidator, parseValidatedRequest, parseValidatedResponse } from '../utils/validation';
import { createLogger } from '../utils/logger';

const log = createLogger('CustomAPIs');

export function buildAdminRouter({ adminAuthMiddleware, n8nRepositories, customRepositories }: ApiRouteContext) {
  const { user, project, workflow, credential, sharedWorkflow, sharedCredential, withTransaction } = n8nRepositories;
  const { tenantProjectRelation } = customRepositories;
  const router = Router();

  router.get(
    '/users/:email/project',
    adminAuthMiddleware,
    createRequestSchemaValidator(getUserProjectSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(getUserProjectSchema, req);
      const { email } = parsed.params;

      const foundUser = await user.findOneBy({ email });
      if (!foundUser) {
        log.warn('Target user not found', { statusCode: 404, email });
        throw new AppError(404, 'Target user does not exist.');
      }

      const personalProject = await project.getPersonalProjectForUserOrFail(foundUser.id);
      const payload = parseValidatedResponse(getUserProjectResponseSchema, {
        user: foundUser,
        project: personalProject,
      });
      res.json(payload);
    }),
  );

  router.post(
    '/associate-workflow',
    adminAuthMiddleware,
    createRequestSchemaValidator(associateWorkflowSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(associateWorkflowSchema, req);
      const { workflowId, projectId, singleOwner } = parsed.body;

      const [wf, proj] = await Promise.all([
        workflow.findOneBy({ id: workflowId }),
        project.findOneBy({ id: projectId }),
      ]);

      if (!wf) {
        log.warn('Workflow move failed: workflow not found', { statusCode: 404, workflowId });
        throw new AppError(404, 'Workflow not found.');
      }

      if (!proj) {
        log.warn('Workflow move failed: project not found', { statusCode: 404, projectId });
        throw new AppError(404, 'Project not found.');
      }

      await withTransaction(sharedWorkflow.manager, null, async (em: any) => {
        if (singleOwner) await em.delete('SharedWorkflow', { workflow: wf });
        const newShare = em.create('SharedWorkflow', { project: proj, workflow: wf, role: 'workflow:owner' });
        await em.save(newShare);
      });

      const payload = parseValidatedResponse(associateWorkflowResponseSchema, {
        success: true as const,
        message: `Workflow '${workflowId}' successfully associated with project '${projectId}'`,
      });

      res.json(payload);
    }),
  );

  router.post(
    '/associate-credential',
    adminAuthMiddleware,
    createRequestSchemaValidator(associateCredentialSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(associateCredentialSchema, req);
      const { credentialId, projectId, singleOwner } = parsed.body;

      const [cred, proj] = await Promise.all([
        credential.findOneBy({ id: credentialId }),
        project.findOneBy({ id: projectId }),
      ]);

      if (!cred) {
        log.warn('Credential move failed: credential not found', { statusCode: 404, credentialId });
        throw new AppError(404, 'Credential not found.');
      }

      if (!proj) {
        log.warn('Credential move failed: project not found', { statusCode: 404, projectId });
        throw new AppError(404, 'Project not found.');
      }

      await withTransaction(sharedCredential.manager, null, async (em: any) => {
        if (singleOwner) await em.delete('SharedCredentials', { credentials: cred });
        const newShare = em.create('SharedCredentials', { project: proj, credentials: cred, role: 'credential:owner' });
        await em.save(newShare);
      });

      const payload = parseValidatedResponse(associateCredentialResponseSchema, {
        success: true as const,
        message: `Credential '${credentialId}' successfully associated with project '${projectId}'`,
      });
      res.json(payload);
    }),
  );

  router.post(
    '/tenant-project-relation',
    adminAuthMiddleware,
    createRequestSchemaValidator(tenantProjectRelationSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(tenantProjectRelationSchema, req);
      const { tenantId, projectId } = parsed.body;

      if (!tenantUuidRegex.test(tenantId)) {
        throw new AppError(400, 'Invalid tenantId (expected UUID).');
      }

      const proj = await project.findOneBy({ id: projectId });
      if (!proj) {
        log.warn('Tenant-project relation insert failed: project not found', { statusCode: 404, projectId });
        throw new AppError(404, 'Project not found.');
      }

      const result = await tenantProjectRelation.insertTenantProjectRelation({ tenantId, projectId });
      if (result.created) {
        const payload = parseValidatedResponse(tenantProjectCreatedResponseSchema, {
          success: true as const,
          message: `Inserted tenant/project relation tenantId=${tenantId} projectId=${projectId}`,
        });
        return res.status(201).json(payload);
      }

      if (result.conflictProjectId) {
        throw new AppError(409, 'tenant already has a project mapping', {
          conflictProjectId: result.conflictProjectId,
        });
      }

      if (result.conflictTenantId) {
        throw new AppError(409, 'projectId is already mapped to a different tenant', {
          conflictTenantId: result.conflictTenantId,
        });
      }

      const payload = parseValidatedResponse(tenantProjectExistsResponseSchema, {
        success: true as const,
        message: 'Relation already exists.',
      });
      res.status(200).json(payload);
    }),
  );

  return router;
}
