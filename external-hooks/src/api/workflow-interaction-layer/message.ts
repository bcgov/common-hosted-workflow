import { Router, Request, Response } from 'express';
import { LOG_PREFIX } from '../constants/logging';
import { AppError, wrapAsyncRoute } from '../utils/errors';
import { formatDbErrorForLog } from '../helpers/db-error';
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

/** Returns project scope from middleware or throws 403 if missing. */
function projectScopeWhere(res: Response, routeLabel: string) {
  const allowed = res.locals.chwfAllowedProjectIds;
  if (!allowed?.length) {
    console.warn(LOG_PREFIX, `[messages] ${routeLabel} 403 missing tenant/user scoped projects`);
    throw new AppError(403, 'Missing tenant project scope');
  }
  return allowed;
}

/** Intersects workflow-shared project IDs with tenant/user-allowed project IDs. */
async function resolveWorkflowProjectScope(
  workflowId: string,
  allowedProjectIds: string[],
  sharedWorkflow: N8nRepositories['sharedWorkflow'],
): Promise<string[]> {
  const workflowProjectIds: string[] = await sharedWorkflow.findProjectIds(workflowId);
  const allowedSet = new Set(allowedProjectIds);
  return workflowProjectIds.filter((id) => allowedSet.has(id));
}

export function createMessageRouter({
  apiKeyAuthMiddleware,
  messageTenantProjectMiddleware,
  n8nRepositories,
  customRepositories,
}: {
  apiKeyAuthMiddleware: unknown;
  messageTenantProjectMiddleware: unknown;
  n8nRepositories: N8nRepositories;
  customRepositories: CustomRepositories;
}) {
  const { sharedWorkflow } = n8nRepositories;
  const { message: messageRepository } = customRepositories;
  const router = Router();

  router.get(
    '/actors/:actorId/messages',
    apiKeyAuthMiddleware,
    messageTenantProjectMiddleware,
    createRequestSchemaValidator(listActorMessagesSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listActorMessagesSchema, req);
      const allowedProjectIds = projectScopeWhere(res, 'GET /v1/actors/:actorId/messages');
      const rows = await messageRepository.list({
        allowedProjectIds,
        actorId: parsed.params.actorId,
        since: parsed.query.since,
        limit: parsed.query.limit ?? 50,
      });
      const payload = parseValidatedResponse(listActorMessagesResponseSchema, rows.map(mapMessageRowToResponse));
      res.status(200).json(payload);
    }),
  );

  router.get(
    '/messages/',
    apiKeyAuthMiddleware,
    messageTenantProjectMiddleware,
    createRequestSchemaValidator(listMessagesSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(listMessagesSchema, req);
      const allowedProjectIds = projectScopeWhere(res, 'GET /v1/messages/');
      const rows = await messageRepository.list({
        allowedProjectIds,
        actorId: parsed.query.actorId,
        since: parsed.query.since,
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
    messageTenantProjectMiddleware,
    createRequestSchemaValidator(createMessageSchema),
    wrapAsyncRoute(async (req: Request, res: Response) => {
      const parsed = parseValidatedRequest(createMessageSchema, req);
      const { title, body, actorId, actorType, workflowInstanceId, workflowId, metadata, status } = parsed.body;
      const allowedProjectIds = projectScopeWhere(res, 'POST /v1/messages/');

      let projectId = '';
      try {
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
