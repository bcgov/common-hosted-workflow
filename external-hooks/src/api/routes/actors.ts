import { Router, Request, Response } from 'express';
import { formatPatchActionStatusMessage } from '../helpers/http-helper';
import { nextCursorFromPagedItems } from '../helpers/list-query';
import { requireExecutionInTenantScope } from '../helpers/n8n-validation';
import { sendValidatedJson } from './helpers/responses';
import { getTenantScopedProjectIds } from './helpers/tenant-scope';
import {
  createActionRequestResponseSchema,
  getActorActionByIdSchema,
  listActionsResponseSchema,
  listActorActionsSchema,
  mapActionRequestRowToResponse,
  patchActionStatusResponseSchema,
  patchActorActionStatusSchema,
} from '../schemas/action-request';
import { listActorMessagesResponseSchema, listActorMessagesSchema, mapMessageRowToResponse } from '../schemas/message';
import type { ApiRouteContext } from '../types/routes';
import { AppError } from '../utils/errors';
import { createRequestSchemaValidator, parseValidatedRequest } from '../utils/validation';

export function buildActorRouter({
  apiKeyAuthMiddleware,
  workflowInteractionTenantMiddleware,
  n8nRepositories,
  customRepositories,
}: ApiRouteContext) {
  const { sharedWorkflow, execution } = n8nRepositories;
  const { message: messageRepository, actionRequest: actionRequestRepository } = customRepositories;
  const router = Router();

  router.get(
    '/actors/:actorId/messages',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(listActorMessagesSchema),
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listActorMessagesSchema, req);
      const allowedProjectIds = getTenantScopedProjectIds(res, 'GET /v1/actors/:actorId/messages', 'messages');
      const { workflowInstanceId } = parsed.query;
      await requireExecutionInTenantScope({
        executionRepository: execution,
        workflowInstanceId,
        allowedProjectIds,
        sharedWorkflowRepository: sharedWorkflow,
      });
      const rows = await messageRepository.list({
        allowedProjectIds,
        actorId: parsed.params.actorId,
        paginationSince: parsed.query.since,
        workflowInstanceId,
        limit: parsed.query.limit ?? 50,
      });
      sendValidatedJson(res, 200, listActorMessagesResponseSchema, rows.map(mapMessageRowToResponse));
    },
  );

  router.get(
    '/actors/:actorId/actions/:actionId',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(getActorActionByIdSchema),
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(getActorActionByIdSchema, req);
      const allowedProjectIds = getTenantScopedProjectIds(res, 'GET /v1/actors/:actorId/actions/:actionId', 'actions');
      const row = await actionRequestRepository.getById({
        allowedProjectIds,
        actionId: parsed.params.actionId,
        actorId: parsed.params.actorId,
      });
      if (!row) throw new AppError(404, 'Action not found');
      sendValidatedJson(res, 200, createActionRequestResponseSchema, mapActionRequestRowToResponse(row));
    },
  );

  router.get(
    '/actors/:actorId/actions',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(listActorActionsSchema),
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listActorActionsSchema, req);
      const allowedProjectIds = getTenantScopedProjectIds(res, 'GET /v1/actors/:actorId/actions', 'actions');
      const { since, limit, workflowInstanceId } = parsed.query;

      await requireExecutionInTenantScope({
        executionRepository: execution,
        workflowInstanceId,
        allowedProjectIds,
        sharedWorkflowRepository: sharedWorkflow,
      });
      const pageLimit = limit ?? 50;
      const rows = await actionRequestRepository.list({
        allowedProjectIds,
        actorId: parsed.params.actorId,
        paginationSince: since,
        workflowInstanceId,
        limit: pageLimit,
      });
      const items = rows.map(mapActionRequestRowToResponse);
      const nextCursor = nextCursorFromPagedItems(items, pageLimit);
      sendValidatedJson(res, 200, listActionsResponseSchema, { items, nextCursor });
    },
  );

  router.patch(
    '/actors/:actorId/actions/:actionId',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(patchActorActionStatusSchema),
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(patchActorActionStatusSchema, req);
      const allowedProjectIds = getTenantScopedProjectIds(
        res,
        'PATCH /v1/actors/:actorId/actions/:actionId',
        'actions',
      );
      const patchStatus = parsed.body.status;
      const updated = await actionRequestRepository.updateStatus({
        allowedProjectIds,
        actionId: parsed.params.actionId,
        actorId: parsed.params.actorId,
        status: patchStatus,
      });
      if (!updated) throw new AppError(404, 'Action not found');
      sendValidatedJson(res, 200, patchActionStatusResponseSchema, {
        status: patchStatus,
        message: formatPatchActionStatusMessage(patchStatus),
      });
    },
  );

  return router;
}
