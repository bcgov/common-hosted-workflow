import { Router, Request, Response } from 'express';
import { nextCursorFromPagedItems } from '../helpers/list-query';
import { OkResponse, CreatedResponse } from './responses';
import { getTenantScopedProjectIds } from './helpers/tenant-scope';
import { buildPatchSetValues } from './helpers/patch-action-set-values';
import {
  createActionRequestResponseSchema,
  createActionRequestSchema,
  getActionByIdSchema,
  listActionsResponseSchema,
  listActionsSchema,
  mapActionRequestRowToResponse,
  patchActionStatusByIdSchema,
} from '../schemas/action-request';
import type { ApiRouteContext } from '../types/routes';
import { createRequestSchemaValidator, parseValidatedRequest } from '../utils/validation';

export function buildActionRouter({
  apiKeyAuthMiddleware,
  workflowInteractionTenantMiddleware,
  services,
}: ApiRouteContext) {
  const router = Router();

  router.post(
    '/actions',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(createActionRequestSchema),
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(createActionRequestSchema, req);
      const body = parsed.body;
      const allowedProjectIds = getTenantScopedProjectIds(res, 'POST /v1/actions', 'actions');

      const created = await services.action.create({
        allowedProjectIds,
        actionType: body.actionType,
        actionTitle: body.actionTitle ?? null,
        payload: body.payload,
        callbackUrl: body.callbackUrl,
        callbackMethod: body.callbackMethod,
        callbackPayloadSpec: body.callbackPayloadSpec,
        actorId: body.actorId,
        actorType: body.actorType,
        workflowInstanceId: body.workflowInstanceId,
        workflowId: body.workflowId,
        status: body.status,
        priority: body.priority,
        dueDate: body.dueDate,
        checkIn: body.checkIn,
        metadata: body.metadata,
      });
      CreatedResponse(res, mapActionRequestRowToResponse(created), createActionRequestResponseSchema);
    },
  );

  router.get(
    '/actions',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(listActionsSchema),
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listActionsSchema, req);
      const allowedProjectIds = getTenantScopedProjectIds(res, 'GET /v1/actions', 'actions');
      const { actorId, since, limit, workflowInstanceId } = parsed.query;

      const pageLimit = limit ?? 50;
      const rows = await services.action.list({
        allowedProjectIds,
        actorId,
        workflowInstanceId,
        limit: pageLimit,
        since,
      });
      const items = rows.map(mapActionRequestRowToResponse);

      const nextCursor = nextCursorFromPagedItems(items, pageLimit);
      OkResponse(res, { items, nextCursor }, listActionsResponseSchema);
    },
  );

  router.get(
    '/actions/:actionId',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(getActionByIdSchema),
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(getActionByIdSchema, req);
      const allowedProjectIds = getTenantScopedProjectIds(res, 'GET /v1/actions/:actionId', 'actions');
      const row = await services.action.getById({
        allowedProjectIds,
        actionId: parsed.params.actionId,
      });
      OkResponse(res, mapActionRequestRowToResponse(row), createActionRequestResponseSchema);
    },
  );

  router.patch(
    '/actions/:actionId',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(patchActionStatusByIdSchema),
    async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(patchActionStatusByIdSchema, req);
      const allowedProjectIds = getTenantScopedProjectIds(res, 'PATCH /v1/actions/:actionId', 'actions');
      // WIL API is trusted — bypass state machine validation via directUpdate.
      const setValues = buildPatchSetValues(parsed.body);

      const row = await services.action.directUpdate({
        allowedProjectIds,
        actionId: parsed.params.actionId,
        setValues,
      });
      OkResponse(res, mapActionRequestRowToResponse(row), createActionRequestResponseSchema);
    },
  );

  return router;
}
