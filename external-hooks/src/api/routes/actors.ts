import { Router, Request, Response } from 'express';
import { nextCursorFromPagedItems, paginateOverfetchedRows } from '../helpers/list-query';
import { OkResponse } from './responses';
import { getTenantScopedProjectIds } from './helpers/tenant-scope';
import { buildPatchSetValues } from './helpers/patch-action-set-values';
import {
  createActionRequestResponseSchema,
  getActorActionByIdSchema,
  listActionsResponseSchema,
  listActorActionsSchema,
  mapActionRequestRowToResponse,
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

      const pageLimit = parsed.query.limit ?? 50;
      const rawRows = await services.message.list({
        allowedProjectIds,
        actorId: parsed.params.actorId,
        workflowInstanceId,
        limit: pageLimit,
        since: parsed.query.since,
      });
      // This endpoint doesn't paginate (no nextCursor in its response); trim the
      // repository's overfetched extra row so callers never see more than `limit` items.
      const { rows } = paginateOverfetchedRows(rawRows, pageLimit);
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
      const rawRows = await services.action.list({
        allowedProjectIds,
        actorId: parsed.params.actorId,
        workflowInstanceId,
        limit: pageLimit,
        since,
      });
      const { rows, hasMore } = paginateOverfetchedRows(rawRows, pageLimit);
      const items = rows.map(mapActionRequestRowToResponse);
      const nextCursor = nextCursorFromPagedItems(items, hasMore);
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
      // WIL API is trusted — bypass state machine validation via directUpdate.
      const setValues = buildPatchSetValues(parsed.body);

      const row = await services.action.directUpdate({
        allowedProjectIds,
        actionId: parsed.params.actionId,
        actorId: parsed.params.actorId,
        setValues,
      });
      OkResponse(res, mapActionRequestRowToResponse(row), createActionRequestResponseSchema);
    },
  );

  return router;
}
