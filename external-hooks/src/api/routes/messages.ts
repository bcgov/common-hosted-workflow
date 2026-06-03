import { Router, Request, Response } from 'express';
import { nextCursorFromPagedItems } from '../helpers/list-query';
import { sendValidatedJson } from './helpers/responses';
import { getTenantScopedProjectIds } from './helpers/tenant-scope';
import {
  createMessageSchema,
  createMessageResponseSchema,
  listMessagesResponseSchema,
  listMessagesSchema,
  mapMessageRowToResponse,
} from '../schemas/message';
import type { ApiRouteContext } from '../types/routes';
import { createRequestSchemaValidator, parseValidatedRequest } from '../utils/validation';

export function buildMessageRouter({
  apiKeyAuthMiddleware,
  workflowInteractionTenantMiddleware,
  services,
}: ApiRouteContext) {
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
      const pageLimit = parsed.query.limit ?? 50;

      const rows = await services.message.list({
        allowedProjectIds,
        actorId: parsed.query.actorId,
        workflowInstanceId,
        limit: pageLimit,
        since: parsed.query.since,
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

      const created = await services.message.create({
        allowedProjectIds,
        title,
        body,
        actorId,
        actorType,
        workflowInstanceId,
        workflowId,
        metadata,
        status,
      });
      sendValidatedJson(res, 201, createMessageResponseSchema, mapMessageRowToResponse(created));
    },
  );

  return router;
}
