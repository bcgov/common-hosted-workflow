import { Router, Request, Response } from 'express';
import { formatDbErrorForLog, normalizeCreateActionTimestamps } from '../helpers/db-helper';
import { formatPatchActionStatusMessage } from '../helpers/http-helper';
import { nextCursorFromPagedItems } from '../helpers/list-query';
import {
  requireChwfAllowedProjectIds,
  requireExecutionInTenantScope,
  resolveProjectIdForCreate,
} from '../helpers/n8n-validation';
import { AppError, wrapAsyncRoute } from '../utils/errors';
import { shortenIdForLog } from '../utils/string';
import {
  createActionRequestResponseSchema,
  createActionRequestSchema,
  getActionByIdSchema,
  listActionsResponseSchema,
  listActionsSchema,
  mapActionRequestRowToResponse,
  patchActionStatusByIdSchema,
  patchActionStatusResponseSchema,
} from '../schemas/action-request';
import type { ApiRouteContext } from '../types/routes';
import { createRequestSchemaValidator, parseValidatedRequest, parseValidatedResponse } from '../utils/validation';
import { createLogger } from '../utils/logger';

const log = createLogger('CustomAPIs');

export function buildActionRouter({
  apiKeyAuthMiddleware,
  workflowInteractionTenantMiddleware,
  n8nRepositories,
  customRepositories,
}: ApiRouteContext) {
  const { sharedWorkflow, execution } = n8nRepositories;
  const { actionRequest: actionRequestRepository } = customRepositories;
  const router = Router();

  router.post(
    '/actions',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(createActionRequestSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(createActionRequestSchema, req);
      const body = parsed.body;
      const allowedProjectIds = requireChwfAllowedProjectIds(res, 'POST /v1/actions', 'actions');

      const { dueDate, checkIn } = normalizeCreateActionTimestamps(body);
      const callbackMethod = body.callbackMethod ?? 'POST';

      const projectId = await resolveProjectIdForCreate({
        executionRepository: execution,
        sharedWorkflowRepository: sharedWorkflow,
        workflowInstanceId: body.workflowInstanceId,
        workflowId: body.workflowId,
        allowedProjectIds,
        logLabel: 'Create action',
      });

      try {
        const created = await actionRequestRepository.create({
          actionType: body.actionType,
          payload: body.payload,
          callbackUrl: body.callbackUrl,
          callbackMethod,
          callbackPayloadSpec: body.callbackPayloadSpec ?? null,
          actorId: body.actorId,
          actorType: body.actorType,
          workflowInstanceId: body.workflowInstanceId,
          workflowId: body.workflowId,
          projectId,
          status: body.status ?? 'pending',
          priority: body.priority ?? 'normal',
          dueDate,
          checkIn,
          metadata: body.metadata ?? null,
        });
        const payload = parseValidatedResponse(
          createActionRequestResponseSchema,
          mapActionRequestRowToResponse(created),
        );
        res.status(201).json(payload);
      } catch (error) {
        const dbDetail = formatDbErrorForLog(error);
        log.error('Create action error', {
          statusCode: 500,
          projectId: shortenIdForLog(projectId),
          workflowId: shortenIdForLog(body.workflowId),
          dbDetail,
          error: String(error),
        });
        throw new AppError(500, 'Internal Server Error');
      }
    }),
  );

  router.get(
    '/actions',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(listActionsSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listActionsSchema, req);
      const allowedProjectIds = requireChwfAllowedProjectIds(res, 'GET /v1/actions', 'actions');
      const { actorId, since, limit, workflowInstanceId } = parsed.query;

      await requireExecutionInTenantScope({
        executionRepository: execution,
        workflowInstanceId,
        allowedProjectIds,
        sharedWorkflowRepository: sharedWorkflow,
      });
      const pageLimit = limit ?? 50;
      const rows = await actionRequestRepository.list({
        allowedProjectIds,
        actorId,
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

  router.get(
    '/actions/:actionId',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(getActionByIdSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(getActionByIdSchema, req);
      const allowedProjectIds = requireChwfAllowedProjectIds(res, 'GET /v1/actions/:actionId', 'actions');
      const row = await actionRequestRepository.getById({
        allowedProjectIds,
        actionId: parsed.params.actionId,
      });
      if (!row) throw new AppError(404, 'Action not found');
      const payload = parseValidatedResponse(createActionRequestResponseSchema, mapActionRequestRowToResponse(row));
      res.status(200).json(payload);
    }),
  );

  router.patch(
    '/actions/:actionId',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    createRequestSchemaValidator(patchActionStatusByIdSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(patchActionStatusByIdSchema, req);
      const allowedProjectIds = requireChwfAllowedProjectIds(res, 'PATCH /v1/actions/:actionId', 'actions');
      const patchStatus = parsed.body.status;
      const updated = await actionRequestRepository.updateStatus({
        allowedProjectIds,
        actionId: parsed.params.actionId,
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
