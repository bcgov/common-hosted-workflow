import { Router, Request, Response } from 'express';
import { formatPatchActionStatusMessage } from '../helpers/http-helper';
import { nextCursorFromPagedItems } from '../helpers/list-query';
import { OkResponse, CreatedResponse } from './responses';
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
import { createRequestSchemaValidator, parseValidatedRequest } from '../utils/validation';

export function buildActorRouter({
  apiKeyAuthMiddleware,
  workflowInteractionTenantMiddleware,
  services,
}: ApiRouteContext) {
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

      const rows = await services.message.list({
        allowedProjectIds,
        actorId: parsed.params.actorId,
        workflowInstanceId,
        limit: parsed.query.limit ?? 50,
        since: parsed.query.since,
      });
      OkResponse(res, rows.map(mapMessageRowToResponse), listActorMessagesResponseSchema);
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
      const row = await services.action.getById({
        allowedProjectIds,
        actionId: parsed.params.actionId,
        actorId: parsed.params.actorId,
      });
      OkResponse(res, mapActionRequestRowToResponse(row), createActionRequestResponseSchema);
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

      const pageLimit = limit ?? 50;
      const rows = await services.action.list({
        allowedProjectIds,
        actorId: parsed.params.actorId,
        workflowInstanceId,
        limit: pageLimit,
        since,
      });
      const items = rows.map(mapActionRequestRowToResponse);
      const nextCursor = nextCursorFromPagedItems(items, pageLimit);
      OkResponse(res, { items, nextCursor }, listActionsResponseSchema);
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
      await services.action.updateStatus({
        allowedProjectIds,
        actionId: parsed.params.actionId,
        actorId: parsed.params.actorId,
        status: patchStatus,
      });
      OkResponse(
        res,
        {
          status: patchStatus,
          message: formatPatchActionStatusMessage(patchStatus),
        },
        patchActionStatusResponseSchema,
      );
    },
  );

  return router;
}
