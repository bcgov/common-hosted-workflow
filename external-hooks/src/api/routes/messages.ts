import { Router, Request, Response } from 'express';
import { nextCursorFromPagedItems } from '../helpers/list-query';
import { requireExecutionInTenantScope, resolveProjectIdForCreate } from '../helpers/n8n-validation';
import { sendValidatedJson } from './helpers/responses';
import { getTenantScopedProjectIds } from './helpers/tenant-scope';
import { AppError } from '../utils/errors';
import { formatDbErrorForLog } from '../helpers/db-helper';
import { shortenIdForLog } from '../utils/string';
import {
  createMessageSchema,
  createMessageResponseSchema,
  listMessagesResponseSchema,
  listMessagesSchema,
  mapMessageRowToResponse,
} from '../schemas/message';
import type { ApiRouteContext } from '../types/routes';
import { createRequestSchemaValidator, parseValidatedRequest } from '../utils/validation';
import { createLogger } from '../utils/logger';

const log = createLogger('CustomAPIs');

export function buildMessageRouter({
  apiKeyAuthMiddleware,
  workflowInteractionTenantMiddleware,
  n8nRepositories,
  customRepositories,
}: ApiRouteContext) {
  const { sharedWorkflow, execution } = n8nRepositories;
  const { message: messageRepository } = customRepositories;
  const router = Router();

  router.get(
    '/messages/',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(listMessagesSchema),
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listMessagesSchema, req);
      const allowedProjectIds = getTenantScopedProjectIds(res, 'GET /v1/messages/', 'messages');
      const { workflowInstanceId } = parsed.query;
      await requireExecutionInTenantScope({
        executionRepository: execution,
        workflowInstanceId,
        allowedProjectIds,
        sharedWorkflowRepository: sharedWorkflow,
      });
      const pageLimit = parsed.query.limit ?? 50;
      const rows = await messageRepository.list({
        allowedProjectIds,
        actorId: parsed.query.actorId,
        paginationSince: parsed.query.since,
        workflowInstanceId,
        limit: pageLimit,
      });
      const items = rows.map(mapMessageRowToResponse);

      const nextCursor = nextCursorFromPagedItems(items, pageLimit);
      sendValidatedJson(res, 200, listMessagesResponseSchema, { items, nextCursor });
    },
  );

  router.post(
    '/messages/',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(createMessageSchema),
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(createMessageSchema, req);
      const { title, body, actorId, actorType, workflowInstanceId, workflowId, metadata, status } = parsed.body;
      const allowedProjectIds = getTenantScopedProjectIds(res, 'POST /v1/messages/', 'messages');

      const projectId = await resolveProjectIdForCreate({
        executionRepository: execution,
        sharedWorkflowRepository: sharedWorkflow,
        workflowInstanceId,
        workflowId,
        allowedProjectIds,
        logLabel: 'Create message',
      });

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
        sendValidatedJson(res, 201, createMessageResponseSchema, mapMessageRowToResponse(created));
      } catch (error) {
        const dbDetail = formatDbErrorForLog(error);
        log.error('Create message error', {
          statusCode: 500,
          projectId: shortenIdForLog(projectId),
          workflowId: shortenIdForLog(workflowId),
          dbDetail,
          error: String(error),
        });
        throw new AppError(500, 'Internal Server Error');
      }
    },
  );

  return router;
}
