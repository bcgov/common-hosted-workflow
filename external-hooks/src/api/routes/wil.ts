import { Router } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiAuthenticatedSession } from '../helpers/ui-oidc';
import { resolveWilTenantProjectIds } from './helpers/wil-tenant';
import { resolveActorIds } from './helpers/wil-actor';
import { parseSinceParam, parseLimit } from './helpers/wil-query';
import { formatListResponse } from './helpers/wil-response';
import { OkResponse } from './responses';

export function buildWilRouter({ services, customRepositories }: ApiRouteContext) {
  const router = Router();

  router.get('/messages', async (req, res) => {
    const allowedProjectIds = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
    const actor = resolveActorIds((req as unknown as { session: UiAuthenticatedSession }).session);
    const limit = parseLimit(req.query.limit as string | undefined);
    const since = parseSinceParam(req.query.since as string | undefined);

    let items = await services.message.list({
      allowedProjectIds,
      actorId: actor.primary,
      limit,
      since,
    });

    if (items.length === 0 && actor.primary !== actor.fallback) {
      items = await services.message.list({
        allowedProjectIds,
        actorId: actor.fallback,
        limit,
        since,
      });
    }

    OkResponse(res, formatListResponse(items, limit));
  });

  router.get('/actions', async (req, res) => {
    const allowedProjectIds = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
    const actor = resolveActorIds((req as unknown as { session: UiAuthenticatedSession }).session);
    const limit = parseLimit(req.query.limit as string | undefined);
    const since = parseSinceParam(req.query.since as string | undefined);

    let items = await services.action.list({
      allowedProjectIds,
      actorId: actor.primary,
      limit,
      since,
    });

    if (items.length === 0 && actor.primary !== actor.fallback) {
      items = await services.action.list({
        allowedProjectIds,
        actorId: actor.fallback,
        limit,
        since,
      });
    }

    OkResponse(res, formatListResponse(items, limit));
  });

  return router;
}
