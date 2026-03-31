import { Router, Request, Response } from 'express';
import { LOG_PREFIX } from '../constants/logging';
import { formatDbErrorForLog, normalizeCreateActionTimestamps } from '../helpers/db-helper';
import { formatPatchActionStatusMessage } from '../helpers/http-helper';
import {
  requireChwfAllowedProjectIds,
  resolveWorkflowProjectScope,
  validateN8nExecutionInTenantScope,
  validateN8nExecutionMatchesWorkflow,
} from '../helpers/n8n-validation';
import { AppError, wrapAsyncRoute } from '../utils/errors';
import { shortenIdForLog } from '../utils/string';
import {
  createActionRequestResponseSchema,
  createActionRequestSchema,
  getActionByIdSchema,
  getActorActionByIdSchema,
  listActionsResponseSchema,
  listActionsSchema,
  listActorActionsSchema,
  mapActionRequestRowToResponse,
  patchActionStatusByIdSchema,
  patchActionStatusResponseSchema,
  patchActorActionStatusSchema,
} from '../schemas/action-request';
import type { CustomRepositories, N8nRepositories } from '../types/repositories';
import { createRequestSchemaValidator, parseValidatedRequest, parseValidatedResponse } from '../utils/validation';

/** Factory for the action-requests `Router`. */
export function createActionRequestRouter({
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
      const callbackMethod = (body.callbackMethod ?? 'POST').trim().toUpperCase();

      let projectId = '';
      try {
        // verify execution vs workflowId, then derive projectId from shared workflow ∩ tenant scope.
        const execCheck = await validateN8nExecutionMatchesWorkflow({
          executionRepository: execution,
          workflowInstanceId: body.workflowInstanceId,
          workflowId: body.workflowId,
        });
        if (execCheck.ok === false) {
          throw new AppError(execCheck.status, execCheck.error);
        }

        const scopedWorkflowProjects = await resolveWorkflowProjectScope(
          body.workflowId,
          allowedProjectIds,
          sharedWorkflow,
        );
        if (!scopedWorkflowProjects.length) {
          throw new AppError(403, 'workflowId is not accessible for this tenant/user scope');
        }
        projectId = scopedWorkflowProjects[0];
      } catch (error) {
        if (error instanceof AppError) throw error;
        const dbDetail = formatDbErrorForLog(error);
        console.error(`${LOG_PREFIX} [500] Create action resolution error:`, dbDetail, error);
        throw new AppError(500, 'Internal Server Error');
      }

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
        console.error(
          `${LOG_PREFIX} [500] Create action error: projectId=${shortenIdForLog(projectId)} workflowId=${shortenIdForLog(body.workflowId)}`,
          dbDetail,
          error,
        );
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

      const rows = await actionRequestRepository.list({
        allowedProjectIds,
        actorId,
        since,
        workflowInstanceId,
        limit: limit ?? 50,
      });
      const items = rows.map(mapActionRequestRowToResponse);
      const pageLimit = limit ?? 50;
      const nextCursor = items.length === pageLimit ? (items.at(-1)?.createdAt?.toISOString?.() ?? null) : null;
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

      const rows = await actionRequestRepository.list({
        allowedProjectIds,
        actorId: parsed.params.actorId,
        since,
        workflowInstanceId,
        limit: limit ?? 50,
      });
      const items = rows.map(mapActionRequestRowToResponse);
      const pageLimit = limit ?? 50;
      const nextCursor = items.length === pageLimit ? (items.at(-1)?.createdAt?.toISOString?.() ?? null) : null;
      const payload = parseValidatedResponse(listActionsResponseSchema, { items, nextCursor });
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
