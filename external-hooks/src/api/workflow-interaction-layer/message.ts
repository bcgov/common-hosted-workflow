import { Router, Request, Response } from 'express';
import { LOG_PREFIX } from '../constants/logging';
import {
  requireChwfAllowedProjectIds,
  resolveWorkflowProjectScope,
  validateN8nExecutionInTenantScope,
  validateN8nExecutionMatchesWorkflow,
} from '../helpers/n8n-validation';
import { AppError, wrapAsyncRoute } from '../utils/errors';
import { formatDbErrorForLog } from '../helpers/db-helper';
import { shortenIdForLog } from '../utils/string';
import {
  createMessageSchema,
  createMessageResponseSchema,
  listActorMessagesResponseSchema,
  listActorMessagesSchema,
  listMessagesResponseSchema,
  listMessagesSchema,
  mapMessageRowToResponse,
} from '../schemas/message';
import type { CustomRepositories, N8nRepositories } from '../types/repositories';
import { createRequestSchemaValidator, parseValidatedRequest, parseValidatedResponse } from '../utils/validation';

/** Factory for the messages `Router` (caller supplies middleware and repos from `route.ts`). */
export function createMessageRouter({
  apiKeyAuthMiddleware,
  workflowInteractionTenantMiddleware,
  n8nRepositories,
  customRepositories,
}: {
  apiKeyAuthMiddleware: unknown;
  workflowInteractionTenantMiddleware: unknown;
  n8nRepositories: N8nRepositories;
  customRepositories: CustomRepositories;
}) {
  const { sharedWorkflow, execution } = n8nRepositories;
  const { message: messageRepository } = customRepositories;
  const router = Router();

  router.get(
    '/actors/:actorId/messages',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(listActorMessagesSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listActorMessagesSchema, req);
      const allowedProjectIds = requireChwfAllowedProjectIds(res, 'GET /v1/actors/:actorId/messages', 'messages');
      const { workflowInstanceId } = parsed.query;
      if (workflowInstanceId) {
        const scopeCheck = await validateN8nExecutionInTenantScope({
          executionRepository: execution,
          workflowInstanceId,
          allowedProjectIds,
          sharedWorkflowRepository: sharedWorkflow,
        });
        if (scopeCheck.ok === false) {
          throw new AppError(scopeCheck.status, scopeCheck.error);
        }
      }
      const rows = await messageRepository.list({
        allowedProjectIds,
        actorId: parsed.params.actorId,
        since: parsed.query.since,
        workflowInstanceId,
        limit: parsed.query.limit ?? 50,
      });
      const payload = parseValidatedResponse(listActorMessagesResponseSchema, rows.map(mapMessageRowToResponse));
      res.status(200).json(payload);
    }),
  );

  router.get(
    '/messages/',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(listMessagesSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listMessagesSchema, req);
      const allowedProjectIds = requireChwfAllowedProjectIds(res, 'GET /v1/messages/', 'messages');
      const { workflowInstanceId } = parsed.query;
      if (workflowInstanceId) {
        const scopeCheck = await validateN8nExecutionInTenantScope({
          executionRepository: execution,
          workflowInstanceId,
          allowedProjectIds,
          sharedWorkflowRepository: sharedWorkflow,
        });
        if (scopeCheck.ok === false) {
          throw new AppError(scopeCheck.status, scopeCheck.error);
        }
      }
      const rows = await messageRepository.list({
        allowedProjectIds,
        actorId: parsed.query.actorId,
        since: parsed.query.since,
        workflowInstanceId,
        limit: parsed.query.limit ?? 50,
      });
      const items = rows.map(mapMessageRowToResponse);
      const pageLimit = parsed.query.limit ?? 50;
      const nextCursor = items.length === pageLimit ? (items.at(-1)?.createdAt?.toISOString?.() ?? null) : null;
      const payload = parseValidatedResponse(listMessagesResponseSchema, { items, nextCursor });
      res.status(200).json(payload);
    }),
  );

  router.post(
    '/messages/',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(createMessageSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(createMessageSchema, req);
      const { title, body, actorId, actorType, workflowInstanceId, workflowId, metadata, status } = parsed.body;
      const allowedProjectIds = requireChwfAllowedProjectIds(res, 'POST /v1/messages/', 'messages');

      let projectId = '';
      try {
        // Align n8n execution with body workflowId, then pick a projectId shared by workflow + tenant scope.
        const execCheck = await validateN8nExecutionMatchesWorkflow({
          executionRepository: execution,
          workflowInstanceId,
          workflowId,
        });
        if (execCheck.ok === false) {
          throw new AppError(execCheck.status, execCheck.error);
        }

        const scopedWorkflowProjects = await resolveWorkflowProjectScope(workflowId, allowedProjectIds, sharedWorkflow);
        if (!scopedWorkflowProjects.length) {
          throw new AppError(403, 'workflowId is not accessible for this tenant/user scope');
        }
        projectId = scopedWorkflowProjects[0];
      } catch (error) {
        if (error instanceof AppError) throw error;
        const dbDetail = formatDbErrorForLog(error);
        console.error(`${LOG_PREFIX} [500] Create message resolution error:`, dbDetail, error);
        throw new AppError(500, 'Internal Server Error');
      }

      try {
        const created = await messageRepository.create({
          title,
          body,
          actorId,
          actorType,
          workflowInstanceId,
          workflowId,
          projectId,
          metadata: metadata ?? null,
          status: status || 'active',
        });
        const payload = parseValidatedResponse(createMessageResponseSchema, mapMessageRowToResponse(created));
        res.status(201).json(payload);
      } catch (error) {
        const dbDetail = formatDbErrorForLog(error);
        console.error(
          `${LOG_PREFIX} [500] Create message error: projectId=${shortenIdForLog(projectId)} workflowId=${shortenIdForLog(workflowId)}`,
          dbDetail,
          error,
        );
        throw new AppError(500, 'Internal Server Error');
      }
    }),
  );

  return router;
}
