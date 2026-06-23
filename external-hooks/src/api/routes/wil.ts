import { Router } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiResolvedSession } from '../helpers/ui-oidc';
import type { UiApiTypedRequest } from '../types/ui-api';
import { resolveWilTenantProjectIds } from './helpers/wil-tenant';
import { resolveActorIds } from './helpers/wil-actor';
import { formatListResponse, mapActionToUiResponse } from './helpers/wil-response';
import { createRequestParser } from '../utils/validation';
import { wilListQuerySchema, wilCallbackSchema, wilChefsTokenSchema, type WilListQuery } from '../schemas/wil';
import { OkResponse } from './responses';
import { AppError } from '../utils/errors';
import { getBearerToken } from '../helpers/ui-oidc-session';
import type { z } from 'zod';

const CALLBACK_TIMEOUT_MS = 30_000;

export function buildWilRouter({ services, customRepositories }: ApiRouteContext) {
  const router = Router();

  /**
   * GET /tenants — Returns available tenants for the logged-in user.
   * Fetches from CSTAR API using the user's OIDC token (forwarded from request),
   * plus the user's personal n8n project as a pseudo-tenant.
   * Falls back to personal project only if CSTAR is unreachable.
   */
  router.get('/tenants', async (req, res) => {
    const session = (req as unknown as { session: UiResolvedSession }).session;
    const accessToken = getBearerToken(req) ?? undefined;

    // CSTAR expects the IDP user GUID (e.g. idir_user_guid), not the Keycloak sub
    const ssoUserId =
      (session.claims.idir_user_guid as string) || (session.claims.bceid_user_guid as string) || session.subject;

    const tenants = await services.tenant.listTenantsForUser({
      ssoUserId,
      accessToken,
      n8nUserId: session.n8nUser?.id,
    });
    OkResponse(res, { tenants });
  });

  router.get(
    '/messages',
    createRequestParser(wilListQuerySchema),
    async (req: UiApiTypedRequest<WilListQuery>, res) => {
      const allowedProjectIds = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
      const actor = resolveActorIds((req as unknown as { session: UiResolvedSession }).session);
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
    const actor = resolveActorIds((req as unknown as { session: UiResolvedSession }).session);
    const { limit, since, status } = req.parsed.query;

    let items = await services.action.list({
      allowedProjectIds,
      actorId: actor.primary,
      limit,
      since,
      status,
    });

    if (items.length === 0 && actor.primary !== actor.fallback) {
      items = await services.action.list({
        allowedProjectIds,
        actorId: actor.fallback,
        limit,
        since,
        status,
      });
    }

    const mapped = items.map(mapActionToUiResponse);
    OkResponse(res, formatListResponse(mapped, limit));
  });

  router.post(
    '/chefs-token',
    createRequestParser(wilChefsTokenSchema),
    async (req: UiApiTypedRequest<z.infer<typeof wilChefsTokenSchema>>, res) => {
      const allowedProjectIds = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
      const actor = resolveActorIds((req as unknown as { session: UiResolvedSession }).session);
      const { actionId } = req.parsed.body;

      const action = await services.action.getById({
        allowedProjectIds,
        actionId,
        actorId: actor.primary,
      });

      if (action.actionType !== 'showform') {
        throw new AppError(400, 'Invalid action type');
      }

      const payload = action.payload as Record<string, unknown>;
      const formApiKey = payload.formApiKey as string | undefined;
      const formId = payload.formId as string | undefined;
      const formName = payload.formName as string | undefined;

      if (!formApiKey) {
        throw new AppError(400, 'Missing formApiKey');
      }

      if (!formId) {
        throw new AppError(400, 'Missing formId');
      }

      const tokenResult = await services.chefs.getFormToken({ formId, formApiKey });

      OkResponse(res, {
        authToken: tokenResult.authToken,
        formId: tokenResult.formId,
        formName,
        baseUrl: tokenResult.baseUrl,
      });
    },
  );

  router.post(
    '/callback',
    createRequestParser(wilCallbackSchema),
    async (req: UiApiTypedRequest<z.infer<typeof wilCallbackSchema>>, res) => {
      const allowedProjectIds = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
      const actor = resolveActorIds((req as unknown as { session: UiResolvedSession }).session);
      const { actionId, body } = req.parsed.body;

      const action = await services.action.getById({
        allowedProjectIds,
        actionId,
        actorId: actor.primary,
      });

      const callbackMethod = action.callbackMethod ?? 'POST';
      const callbackUrl = action.callbackUrl ?? '';

      // Skip upstream call when method is NONE or URL is empty
      if (callbackMethod === 'NONE' || !callbackUrl) {
        await services.action.updateStatus({
          allowedProjectIds,
          actionId,
          actorId: actor.primary,
          status: 'completed',
        });
        OkResponse(res, { success: true, message: 'Action completed' });
        return;
      }

      // Forward body to callbackUrl with 30s timeout
      let upstreamResponse: Response;
      try {
        upstreamResponse = await fetch(callbackUrl, {
          method: callbackMethod,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new AppError(504, 'Upstream timeout');
        }
        throw new AppError(502, 'Upstream request failed');
      }

      // Non-2xx → return upstream error without updating status
      if (!upstreamResponse.ok) {
        const upstreamBody = await upstreamResponse.text();
        res.status(upstreamResponse.status).json({
          error: { message: upstreamBody || `Upstream returned ${upstreamResponse.status}` },
        });
        return;
      }

      // 2xx → update status to completed
      await services.action.updateStatus({
        allowedProjectIds,
        actionId,
        actorId: actor.primary,
        status: 'completed',
      });

      OkResponse(res, { success: true, message: 'Action completed' });
    },
  );

  return router;
}
