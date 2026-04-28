import { Router, Request, Response } from 'express';
import { formatPatchActionStatusMessage } from '../helpers/http-helper';
import { nextCursorFromPagedItems } from '../helpers/list-query';
import { requireChwfAllowedProjectIds, requireExecutionInTenantScope } from '../helpers/n8n-validation';
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
import { AppError, wrapAsyncRoute } from '../utils/errors';
import { createRequestSchemaValidator, parseValidatedRequest, parseValidatedResponse } from '../utils/validation';

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
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listActorMessagesSchema, req);
      const allowedProjectIds = requireChwfAllowedProjectIds(res, 'GET /v1/actors/:actorId/messages', 'messages');
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
      const payload = parseValidatedResponse(listActorMessagesResponseSchema, rows.map(mapMessageRowToResponse));
      res.status(200).json(payload);
    }),
  );

  router.get(
    '/actors/:actorId/actions/:actionId',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(getActorActionByIdSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(getActorActionByIdSchema, req);
      const allowedProjectIds = requireChwfAllowedProjectIds(
        res,
        'GET /v1/actors/:actorId/actions/:actionId',
        'actions',
      );
      const row = await actionRequestRepository.getById({
        allowedProjectIds,
        actionId: parsed.params.actionId,
        actorId: parsed.params.actorId,
      });
      if (!row) throw new AppError(404, 'Action not found');
      const payload = parseValidatedResponse(createActionRequestResponseSchema, mapActionRequestRowToResponse(row));
      res.status(200).json(payload);
    }),
  );

  router.get(
    '/actors/:actorId/actions',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(listActorActionsSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listActorActionsSchema, req);
      const allowedProjectIds = requireChwfAllowedProjectIds(res, 'GET /v1/actors/:actorId/actions', 'actions');
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
      const payload = parseValidatedResponse(listActionsResponseSchema, { items, nextCursor });
      res.status(200).json(payload);
    }),
  );

  router.patch(
    '/actors/:actorId/actions/:actionId',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(patchActorActionStatusSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(patchActorActionStatusSchema, req);
      const allowedProjectIds = requireChwfAllowedProjectIds(
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
      const payload = parseValidatedResponse(patchActionStatusResponseSchema, {
        status: patchStatus,
        message: formatPatchActionStatusMessage(patchStatus),
      });
      res.status(200).json(payload);
    }),
  );

  return router;
}
