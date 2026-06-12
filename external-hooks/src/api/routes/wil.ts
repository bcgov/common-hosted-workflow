import { Router } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiAuthenticatedSession } from '../helpers/ui-oidc';
import type { UiApiTypedRequest } from '../types/ui-api';
import { resolveWilTenantProjectIds } from './helpers/wil-tenant';
import { resolveActorIds } from './helpers/wil-actor';
import { formatListResponse, mapActionToUiResponse } from './helpers/wil-response';
import { createRequestParser } from '../utils/validation';
import { wilListQuerySchema, wilCallbackSchema, wilChefsTokenSchema, type WilListQuery } from '../schemas/wil';
import { OkResponse } from './responses';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import type { z } from 'zod';

const CALLBACK_TIMEOUT_MS = 30_000;
const log = createLogger('WilRouter');

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
      const actor = resolveActorIds((req as unknown as { session: UiAuthenticatedSession }).session);
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

      const chefsGatewayUrl = process.env.CHEFS_GATEWAY_URL || 'https://submit.digital.gov.bc.ca/app/gateway/v1';
      const chefsBaseUrl = chefsGatewayUrl.replace(/\/gateway\/v\d+\/?$/, '');
      const tokenUrl = `${chefsGatewayUrl}/auth/token/forms/${formId}`;
      const credentials = Buffer.from(`${formId}:${formApiKey}`).toString('base64');

      let tokenResponse: Response;
      try {
        tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
        });
      } catch {
        throw new AppError(502, 'CHEFS token exchange failed');
      }

      if (!tokenResponse.ok) {
        throw new AppError(502, 'CHEFS token exchange failed');
      }

      const tokenData = (await tokenResponse.json()) as { token: string };

      OkResponse(res, {
        authToken: tokenData.token,
        formId,
        formName,
        baseUrl: chefsBaseUrl,
      });
    },
  );

  router.post(
    '/callback',
    createRequestParser(wilCallbackSchema),
    async (req: UiApiTypedRequest<z.infer<typeof wilCallbackSchema>>, res) => {
      const allowedProjectIds = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
      const actor = resolveActorIds((req as unknown as { session: UiAuthenticatedSession }).session);
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

      // 2xx → update status to completed (failure here is non-fatal)
      try {
        await services.action.updateStatus({
          allowedProjectIds,
          actionId,
          actorId: actor.primary,
          status: 'completed',
        });
      } catch (err) {
        log.error('Failed to update action status after successful upstream callback', err);
      }

      OkResponse(res, { success: true, message: 'Action completed' });
    },
  );

  return router;
}
