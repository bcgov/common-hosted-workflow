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
import { OkResponse, CreatedResponse } from './responses';
import type { N8nEntityRecord } from '../types/n8n-adapters';
import type { ApiRouteContext } from '../types/routes';
import { AppError } from '../utils/errors';
import { createRequestSchemaValidator, parseValidatedRequest } from '../utils/validation';
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
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(getUserProjectSchema, req);
      const { email } = parsed.params;

      const foundUser = await user.findOneBy({ email });
      if (!foundUser) {
        log.warn('Target user not found', { statusCode: 404, email });
        throw new AppError(404, 'Target user does not exist.');
      }

      const personalProject = await project.getPersonalProjectForUserOrFail(foundUser.id);
      OkResponse(
        res,
        {
          user: foundUser,
          project: personalProject,
        },
        getUserProjectResponseSchema,
      );
    },
  );

  router.post(
    '/associate-workflow',
    adminAuthMiddleware,
    createRequestSchemaValidator(associateWorkflowSchema),
    async (req: Request, res: Response) => {
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

      await withTransaction(sharedWorkflow.manager, null, async (em) => {
        if (singleOwner) await em.delete('SharedWorkflow', { workflow: wf });
        const newShare = em.create('SharedWorkflow', {
          project: proj as N8nEntityRecord,
          workflow: wf as N8nEntityRecord,
          role: 'workflow:owner',
        });
        await em.save(newShare);
      });

      OkResponse(
        res,
        {
          success: true as const,
          message: `Workflow '${workflowId}' successfully associated with project '${projectId}'`,
        },
        associateWorkflowResponseSchema,
      );
    },
  );

  router.post(
    '/associate-credential',
    adminAuthMiddleware,
    createRequestSchemaValidator(associateCredentialSchema),
    async (req: Request, res: Response) => {
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

      await withTransaction(sharedCredential.manager, null, async (em) => {
        if (singleOwner) await em.delete('SharedCredentials', { credentials: cred });
        const newShare = em.create('SharedCredentials', {
          project: proj as N8nEntityRecord,
          credentials: cred as N8nEntityRecord,
          role: 'credential:owner',
        });
        await em.save(newShare);
      });

      OkResponse(
        res,
        {
          success: true as const,
          message: `Credential '${credentialId}' successfully associated with project '${projectId}'`,
        },
        associateCredentialResponseSchema,
      );
    },
  );

  router.post(
    '/tenant-project-relation',
    adminAuthMiddleware,
    createRequestSchemaValidator(tenantProjectRelationSchema),
    async (req: Request, res: Response) => {
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
        CreatedResponse(
          res,
          {
            success: true as const,
            message: `Inserted tenant/project relation tenantId=${tenantId} projectId=${projectId}`,
          },
          tenantProjectCreatedResponseSchema,
        );
        return;
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

      OkResponse(
        res,
        {
          success: true as const,
          message: 'Relation already exists.',
        },
        tenantProjectExistsResponseSchema,
      );
    },
  );

  return router;
}
