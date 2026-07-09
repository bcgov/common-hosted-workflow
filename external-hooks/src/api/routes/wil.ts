import { Router } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiResolvedSession } from '../helpers/ui-oidc';
import type { UiApiTypedRequest } from '../types/ui-api';
import { resolveWilTenantProjectIds } from './helpers/wil-tenant';
import { resolveActorMatchers } from './helpers/wil-actor';
import { formatListResponse, mapActionToUiResponse } from './helpers/wil-response';
import { createRequestParser } from '../utils/validation';
import { wilListQuerySchema, wilCallbackSchema, wilChefsTokenSchema, type WilListQuery } from '../schemas/wil';
import { OkResponse } from './responses';
import { AppError } from '../utils/errors';
import { getBearerToken } from '../helpers/ui-oidc-session';
import { buildTriggerRouter } from './triggers';
import { callWebhook } from './helpers/webhook-fire';
import { CALLBACK_TIMEOUT_MS } from './constants/constants';
import { isSharedActorType } from '../services/action-state-machine';
import type { z } from 'zod';

export function buildWilRouter(routeContext: ApiRouteContext) {
  const { services, customRepositories } = routeContext;
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
      const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
        req,
        customRepositories.tenantProjectRelation,
      );
      const session = (req as unknown as { session: UiResolvedSession }).session;
      const actorMatchers = resolveActorMatchers(session, tenantId);
      const { limit, since } = req.parsed.query;

      const items = await services.message.list({
        allowedProjectIds,
        actorMatchers,
        limit,
        since,
      });

      OkResponse(res, formatListResponse(items, limit));
    },
  );

  router.get('/actions/counts', async (req, res) => {
    const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
      req,
      customRepositories.tenantProjectRelation,
    );
    const session = (req as unknown as { session: UiResolvedSession }).session;
    const actorMatchers = resolveActorMatchers(session, tenantId);

    const counts = await services.action.countByStatus({
      allowedProjectIds,
      actorMatchers,
    });
    OkResponse(res, { counts });
  });

  router.get('/actions', createRequestParser(wilListQuerySchema), async (req: UiApiTypedRequest<WilListQuery>, res) => {
    const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
      req,
      customRepositories.tenantProjectRelation,
    );
    const session = (req as unknown as { session: UiResolvedSession }).session;
    const actorMatchers = resolveActorMatchers(session, tenantId);
    const { limit, since, status } = req.parsed.query;

    const items = await services.action.list({
      allowedProjectIds,
      actorMatchers,
      limit,
      since,
      status,
    });

    const mapped = items.map(mapActionToUiResponse);
    OkResponse(res, formatListResponse(mapped, limit));
  });

  router.post(
    '/chefs-token',
    createRequestParser(wilChefsTokenSchema),
    async (req: UiApiTypedRequest<z.infer<typeof wilChefsTokenSchema>>, res) => {
      const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
        req,
        customRepositories.tenantProjectRelation,
      );
      const session = (req as unknown as { session: UiResolvedSession }).session;
      const actorMatchers = resolveActorMatchers(session, tenantId);
      const { actionId } = req.parsed.body;

      const action = await services.action.getById({
        allowedProjectIds,
        actionId,
        actorMatchers,
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
      const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
        req,
        customRepositories.tenantProjectRelation,
      );
      const session = (req as unknown as { session: UiResolvedSession }).session;
      const actorMatchers = resolveActorMatchers(session, tenantId);
      const { actionId, body } = req.parsed.body;

      const action = await services.action.getById({
        allowedProjectIds,
        actionId,
        actorMatchers,
      });

      // Claim gate: role/group actions require the claiming actor to complete
      if (isSharedActorType(action.actorType) && action.claimedBy !== session.email) {
        throw new AppError(403, 'Only the claiming actor can complete this action');
      }

      const callbackMethod = action.callbackMethod ?? 'POST';
      const callbackUrl = action.callbackUrl ?? '';

      // Skip upstream call when method is NONE or URL is empty
      if (callbackMethod === 'NONE' || !callbackUrl) {
        await services.action.updateStatus({
          allowedProjectIds,
          actionId,
          actorMatchers,
          status: 'completed',
          actorEmail: session.email,
          currentAction: action,
        });
        OkResponse(res, { success: true, message: 'Action completed' });
        return;
      }

      // Forward body to callbackUrl with 30s timeout
      const upstreamResponse = await callWebhook({
        url: callbackUrl,
        method: callbackMethod,
        body: JSON.stringify(body),
        timeoutMs: CALLBACK_TIMEOUT_MS,
        timeoutMessage: 'Upstream timeout',
        unreachableMessage: 'Upstream request failed',
      });

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
        actorMatchers,
        status: 'completed',
        actorEmail: session.email,
        currentAction: action,
      });

      OkResponse(res, { success: true, message: 'Action completed' });
    },
  );

  // POST /actions/:actionId/claim
  router.post('/actions/:actionId/claim', async (req, res) => {
    const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
      req,
      customRepositories.tenantProjectRelation,
    );
    const session = (req as unknown as { session: UiResolvedSession }).session;
    const actorMatchers = resolveActorMatchers(session, tenantId);

    const row = await services.claim.claim({
      actionId: req.params.actionId,
      actorEmail: session.email,
      actorMatchers,
      allowedProjectIds,
    });
    OkResponse(res, mapActionToUiResponse(row));
  });

  // POST /actions/:actionId/unclaim
  router.post('/actions/:actionId/unclaim', async (req, res) => {
    const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
      req,
      customRepositories.tenantProjectRelation,
    );
    const session = (req as unknown as { session: UiResolvedSession }).session;
    const actorMatchers = resolveActorMatchers(session, tenantId);

    const row = await services.claim.unclaim({
      actionId: req.params.actionId,
      actorEmail: session.email,
      actorMatchers,
      allowedProjectIds,
    });
    OkResponse(res, mapActionToUiResponse(row));
  });

  // GET /actions/:actionId/verify-claim — checks the action is still claimed by the calling user
  router.get('/actions/:actionId/verify-claim', async (req, res) => {
    const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
      req,
      customRepositories.tenantProjectRelation,
    );
    const session = (req as unknown as { session: UiResolvedSession }).session;
    const actorMatchers = resolveActorMatchers(session, tenantId);

    const action = await services.action.getById({
      allowedProjectIds,
      actionId: req.params.actionId,
      actorMatchers,
    });

    const valid =
      action.claimedBy === session.email && (action.status === 'claimed' || action.status === 'in_progress');
    OkResponse(res, { valid, status: action.status, claimedBy: action.claimedBy });
  });

  // POST /actions/:actionId/start
  router.post('/actions/:actionId/start', async (req, res) => {
    const { projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
      req,
      customRepositories.tenantProjectRelation,
    );
    const session = (req as unknown as { session: UiResolvedSession }).session;

    const row = await services.claim.start({
      actionId: req.params.actionId,
      actorEmail: session.email,
      allowedProjectIds,
    });
    OkResponse(res, mapActionToUiResponse(row));
  });

  router.use(buildTriggerRouter(routeContext));

  return router;
}
