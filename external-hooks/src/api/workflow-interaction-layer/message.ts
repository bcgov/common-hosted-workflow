import { messages } from '../../db/schema/workflow-interaction-layer';
import { MessageRepository } from '../../db/repository/workflow-interaction-layer/message';
import {
  formatDbErrorForLog,
  parseDate,
  parsePositiveInteger,
  shortIdForLog,
  toTrimmedString,
  validateNonEmpty,
} from '../middleware';

type Request = {
  params: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body: Record<string, unknown>;
  chwfAllowedProjectIds?: string[];
  caller?: { id: string };
};

type Response = {
  status: (code: number) => { json: (payload: unknown) => unknown };
  json: (payload: unknown) => unknown;
};

const mapMessage = (item: typeof messages.$inferSelect) => ({
  id: item.id,
  title: item.title,
  body: item.body,
  actorId: item.actorId,
  actorType: item.actorType,
  workflowInstanceId: item.workflowInstanceId,
  workflowId: item.workflowId,
  projectId: item.projectId,
  status: item.status,
  metadata: item.metadata,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

/** Returns project scope from middleware or sends 403 if missing. */
function projectScopeWhere(req: Request, res: Response, logPrefix: string, routeLabel: string) {
  const allowed = req.chwfAllowedProjectIds;
  if (!allowed?.length) {
    console.warn(logPrefix, `[messages] ${routeLabel} 403 missing tenant/user scoped projects`);
    res.status(403).json({ error: 'Missing tenant project scope' });
    return null;
  }
  return allowed;
}

/** Intersects workflow-shared project IDs with tenant/user-allowed project IDs. */
async function resolveWorkflowProjectScope(
  workflowId: string,
  allowedProjectIds: string[],
  sharedWorkflowRepository: any,
): Promise<string[]> {
  const workflowProjectIds: string[] = await sharedWorkflowRepository.findProjectIds(workflowId);
  const allowedSet = new Set(allowedProjectIds);
  return workflowProjectIds.filter((id) => allowedSet.has(id));
}

export function registerMessageRoutes({
  app,
  apiKeyAuthMiddleware,
  messageTenantProjectMiddleware,
  messageRepository,
  sharedWorkflowRepository,
  logPrefix,
}: {
  app: any;
  apiKeyAuthMiddleware: any;
  messageTenantProjectMiddleware: any;
  messageRepository: MessageRepository;
  sharedWorkflowRepository: any;
  logPrefix: string;
}) {
  app.get(
    '/rest/custom/v1/actors/:actorId/messages',
    apiKeyAuthMiddleware,
    messageTenantProjectMiddleware,
    async (req: Request, res: Response) => {
      const { actorId } = req.params;
      const { since, limit } = req.query;
      const allowedProjectIds = projectScopeWhere(req, res, logPrefix, 'GET /v1/actors/:actorId/messages');
      if (!allowedProjectIds) return;
      if (!validateNonEmpty(actorId)) return res.status(400).json({ error: 'Invalid actorId' });

      const parsedSince = parseDate(since);
      if (since !== undefined && !parsedSince) return res.status(400).json({ error: 'Invalid since' });
      const parsedLimit = limit ? parsePositiveInteger(limit) : 50;
      if (!parsedLimit || parsedLimit > 200) {
        return res.status(400).json({ error: 'Invalid limit. Use integer between 1 and 200.' });
      }

      try {
        const rows = await messageRepository.list({
          allowedProjectIds,
          actorId,
          since: parsedSince ?? undefined,
          limit: parsedLimit,
        });
        return res.status(200).json(rows.map(mapMessage));
      } catch (error) {
        console.error(`${logPrefix} [500] Get actor messages error:`, (error as Error).message);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
    },
  );

  app.get(
    '/rest/custom/v1/messages/',
    apiKeyAuthMiddleware,
    messageTenantProjectMiddleware,
    async (req: Request, res: Response) => {
      const { actorId, since, limit } = req.query;
      const allowedProjectIds = projectScopeWhere(req, res, logPrefix, 'GET /v1/messages/');
      if (!allowedProjectIds) return;
      if (actorId !== undefined && !validateNonEmpty(actorId))
        return res.status(400).json({ error: 'Invalid actorId' });

      const parsedSince = parseDate(since);
      if (since !== undefined && !parsedSince) return res.status(400).json({ error: 'Invalid since' });
      const parsedLimit = limit ? parsePositiveInteger(limit) : 50;
      if (!parsedLimit || parsedLimit > 200) {
        return res.status(400).json({ error: 'Invalid limit. Use integer between 1 and 200.' });
      }

      try {
        const rows = await messageRepository.list({
          allowedProjectIds,
          actorId: actorId || undefined,
          since: parsedSince ?? undefined,
          limit: parsedLimit,
        });
        const items = rows.map(mapMessage);
        const nextCursor = items.length === parsedLimit ? (items.at(-1)?.createdAt?.toISOString?.() ?? null) : null;
        return res.status(200).json({ items, nextCursor });
      } catch (error) {
        console.error(`${logPrefix} [500] Get messages error:`, (error as Error).message);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
    },
  );

  app.post(
    '/rest/custom/v1/messages/',
    apiKeyAuthMiddleware,
    messageTenantProjectMiddleware,
    async (req: Request, res: Response) => {
      const payload = req.body ?? {};
      const title = toTrimmedString(payload.title);
      const body = toTrimmedString(payload.body);
      const actorId = toTrimmedString(payload.actorId);
      const actorType = toTrimmedString(payload.actorType).toLowerCase();
      const workflowInstanceId = toTrimmedString(payload.workflowInstanceId);
      const workflowId = toTrimmedString(payload.workflowId);
      const metadata = payload.metadata as Record<string, unknown> | undefined;
      const status = toTrimmedString(payload.status).toLowerCase();

      if (!title || !body || !actorId || !actorType || !workflowInstanceId || !workflowId) {
        return res.status(400).json({
          error: 'Invalid payload. Required fields: title, body, actorId, actorType, workflowInstanceId, workflowId',
        });
      }
      const allowedActorTypes = new Set(['user', 'role', 'group', 'system', 'other']);
      if (!allowedActorTypes.has(actorType)) {
        return res.status(400).json({ error: `Invalid actorType. Allowed: ${[...allowedActorTypes].join(', ')}` });
      }
      if (status && !['active', 'read'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Allowed: active, read' });
      }

      let projectId = '';
      try {
        const allowedProjectIds = projectScopeWhere(req, res, logPrefix, 'POST /v1/messages/');
        if (!allowedProjectIds) return;

        const scopedWorkflowProjects = await resolveWorkflowProjectScope(
          workflowId,
          allowedProjectIds,
          sharedWorkflowRepository,
        );
        if (!scopedWorkflowProjects.length) {
          return res.status(403).json({ error: 'workflowId is not accessible for this tenant/user scope' });
        }
        projectId = scopedWorkflowProjects[0];
      } catch (error) {
        const dbDetail = formatDbErrorForLog(error);
        console.error(`${logPrefix} [500] Create message resolution error:`, dbDetail, error);
        return res.status(500).json({ error: 'Internal Server Error' });
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
        return res.status(201).json(mapMessage(created));
      } catch (error) {
        const dbDetail = formatDbErrorForLog(error);
        console.error(
          `${logPrefix} [500] Create message error: projectId=${shortIdForLog(projectId)} workflowId=${shortIdForLog(workflowId)}`,
          dbDetail,
          error,
        );
        return res.status(500).json({ error: 'Internal Server Error' });
      }
    },
  );
}
