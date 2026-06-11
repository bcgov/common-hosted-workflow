import { Router } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiAuthenticatedSession } from '../helpers/ui-oidc';
import type { UiApiTypedRequest } from '../types/ui-api';
import { resolveWilTenantProjectIds } from './helpers/wil-tenant';
import { resolveActorIds } from './helpers/wil-actor';
import { formatListResponse } from './helpers/wil-response';
import { createRequestParser } from '../utils/validation';
import { wilListQuerySchema, type WilListQuery } from '../schemas/wil';
import { OkResponse } from './responses';

export function buildWilRouter({ services, customRepositories }: ApiRouteContext) {
  const router = Router();

  /**
   * GET /tenants — Returns available tenants for the logged-in user.
   * Currently resolves distinct tenants from the tenant_project_relation table.
   * TODO: Replace with CSTAR API integration to resolve tenants and real names per user.
   */
  router.get('/tenants', async (_req, res) => {
    const tenants = await services.tenant.listTenants();
    OkResponse(res, { tenants });
  });

  router.get(
    '/messages',
    createRequestParser(wilListQuerySchema),
    async (req: UiApiTypedRequest<WilListQuery>, res) => {
      const allowedProjectIds = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
      const actor = resolveActorIds((req as unknown as { session: UiAuthenticatedSession }).session);
      const { limit, since } = req.parsed.query;

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
    },
  );

  router.get('/actions', createRequestParser(wilListQuerySchema), async (req: UiApiTypedRequest<WilListQuery>, res) => {
    const allowedProjectIds = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
    const actor = resolveActorIds((req as unknown as { session: UiAuthenticatedSession }).session);
    const { limit, since } = req.parsed.query;

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
