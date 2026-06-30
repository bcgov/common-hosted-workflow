import { Router, type Request, type Response } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiResolvedSession } from '../helpers/ui-oidc';
import type { UiApiTypedRequest } from '../types/ui-api';
import { resolveWilTenantProjectIds, resolveTenantProjectIds } from './helpers/wil-tenant';
import { createRequestParser } from '../utils/validation';
import {
  listTriggersSchema,
  createTriggerSchema,
  updateTriggerSchema,
  fireTriggerSchema,
  getTriggerChefsTokenSchema,
  getTriggerChefsTokenResponseSchema,
  mapTriggerRowToResponse,
  listTriggersResponseSchema,
  createTriggerResponseSchema,
  updateTriggerResponseSchema,
  fireTriggerResponseSchema,
} from '../schemas/trigger';
import { OkResponse, CreatedResponse, ForbiddenResponse } from './responses';
import { AppError } from '../utils/errors';
import { X_TENANT_ID_HEADER } from '../constants/headers';
import { decrypt } from '../utils/secret-box';
import { WIL_ENCRYPTION_KEY } from '@config';
import type { z } from 'zod';

const TRIGGER_MANAGE_ROLE = 'project:editor';
const FIRE_TIMEOUT_MS = 30_000;

/**
 * Returns true if the user may create or edit triggers for the given tenant.
 */
async function canManageTriggers(
  tenantId: string,
  session: UiResolvedSession,
  customRepositories: ApiRouteContext['customRepositories'],
): Promise<boolean> {
  const tenantRow = await customRepositories.tenantProjectRelation.getRowByTenantId(tenantId);
  if (!tenantRow) return false;
  if (tenantRow.projectType === 'personal') return true;
  return session.tenantRoles.some((tr) => tr.tenantId === tenantId && tr.roles.includes(TRIGGER_MANAGE_ROLE));
}

/**
 * Returns true if the actor (session user) is explicitly allowed to fire a trigger,
 * based on the trigger's allowed_actors_type and allowed_actors.
 */
function isActorAllowed(
  trigger: { allowedActorsType: string; allowedActors: string[] },
  session: UiResolvedSession,
  tenantId: string,
): boolean {
  const { allowedActors, allowedActorsType } = trigger;
  const actorsLower = new Set(allowedActors.map((a) => a.toLowerCase()));
  if (actorsLower.has('*')) return true;

  if (allowedActorsType === 'user') {
    return actorsLower.has(session.email.toLowerCase());
  }

  if (allowedActorsType === 'role') {
    const tenantRoles = session.tenantRoles.find((tr) => tr.tenantId === tenantId)?.roles ?? [];
    return tenantRoles.some((r) => actorsLower.has(r.toLowerCase()));
  }

  return false;
}

export function buildTriggerRouter(routeContext: ApiRouteContext) {
  const { services, customRepositories } = routeContext;
  const router = Router();

  /** GET /wil/triggers — list all triggers for the tenant. All authenticated users may list. */
  router.get('/triggers', createRequestParser(listTriggersSchema), async (req: Request, res: Response) => {
    const { projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
      req,
      customRepositories.tenantProjectRelation,
    );
    const rows = await services.trigger.list({ projectIds: allowedProjectIds });

    // Batch-check which chefs-form triggers have a stored credential so the response
    // can include the placeholder instead of returning an empty apiKey field.
    const chefsFormIds = rows.filter((r) => r.triggerType === 'chefs-form').map((r) => r.id);
    const triggerIdsWithCreds =
      chefsFormIds.length > 0
        ? await customRepositories.triggerCredentialRelation.listTriggerIdsWithCredentials(chefsFormIds)
        : new Set<string>();

    OkResponse(
      res,
      { data: rows.map((r) => mapTriggerRowToResponse(r, triggerIdsWithCreds.has(r.id))) },
      listTriggersResponseSchema,
    );
  });

  /** POST /wil/triggers — create a trigger. Requires project:editor role or personal project. */
  router.post(
    '/triggers',
    createRequestParser(createTriggerSchema),
    async (req: UiApiTypedRequest<z.infer<typeof createTriggerSchema>>, res: Response) => {
      const session = (req as unknown as { session: UiResolvedSession }).session;
      const tenantId = req.header(X_TENANT_ID_HEADER)?.trim();
      const allowedProjectIds = await resolveTenantProjectIds(tenantId, customRepositories.tenantProjectRelation);

      const allowed = await canManageTriggers(tenantId ?? '', session, customRepositories);
      if (!allowed) {
        ForbiddenResponse(res);
        return;
      }

      const {
        triggerType,
        triggerUrl,
        triggerMethod,
        metadata,
        allowedActorsType,
        allowedActors,
        authEnabled,
        createdBy,
      } = req.parsed.body;

      const row = await services.trigger.create({
        projectId: allowedProjectIds[0],
        triggerType,
        triggerUrl,
        triggerMethod,
        metadata,
        allowedActorsType,
        allowedActors,
        authEnabled,
        createdBy: createdBy ?? session.email ?? null,
      });

      // After create, check if credential was linked (for the placeholder in the response)
      const triggerIdsWithCreds =
        row.triggerType === 'chefs-form'
          ? await customRepositories.triggerCredentialRelation.listTriggerIdsWithCredentials([row.id])
          : new Set<string>();

      CreatedResponse(res, mapTriggerRowToResponse(row, triggerIdsWithCreds.has(row.id)), createTriggerResponseSchema);
    },
  );

  /** PUT /wil/triggers/:triggerId — update a trigger's metadata, actors, and authEnabled. */
  router.put(
    '/triggers/:triggerId',
    createRequestParser(updateTriggerSchema),
    async (req: UiApiTypedRequest<z.infer<typeof updateTriggerSchema>>, res: Response) => {
      const session = (req as unknown as { session: UiResolvedSession }).session;
      const tenantId = req.header(X_TENANT_ID_HEADER)?.trim();
      const allowedProjectIds = await resolveTenantProjectIds(tenantId, customRepositories.tenantProjectRelation);

      const allowed = await canManageTriggers(tenantId ?? '', session, customRepositories);
      if (!allowed) {
        ForbiddenResponse(res);
        return;
      }

      const { triggerId } = req.parsed.params;
      const { triggerUrl, triggerMethod, metadata, allowedActorsType, allowedActors, authEnabled, updatedBy } =
        req.parsed.body;

      const row = await services.trigger.update({
        triggerId,
        projectIds: allowedProjectIds,
        triggerUrl,
        triggerMethod,
        metadata,
        allowedActorsType,
        allowedActors,
        authEnabled,
        updatedBy: updatedBy ?? session.email ?? '',
      });

      // Check credential presence after update (apiKey may have been added or remained)
      const triggerIdsWithCreds =
        row.triggerType === 'chefs-form'
          ? await customRepositories.triggerCredentialRelation.listTriggerIdsWithCredentials([row.id])
          : new Set<string>();

      OkResponse(res, mapTriggerRowToResponse(row, triggerIdsWithCreds.has(row.id)), updateTriggerResponseSchema);
    },
  );

  /**
   * POST /wil/triggers/:triggerId/chefs-token — returns a CHEFS auth token for the trigger's form.
   * Requires the actor to be allowed to fire the trigger (same permission as the fire endpoint).
   */
  router.post(
    '/triggers/:triggerId/chefs-token',
    createRequestParser(getTriggerChefsTokenSchema),
    async (req: UiApiTypedRequest<z.infer<typeof getTriggerChefsTokenSchema>>, res: Response) => {
      const session = (req as unknown as { session: UiResolvedSession }).session;
      const tenantId = req.header(X_TENANT_ID_HEADER)?.trim();
      const allowedProjectIds = await resolveTenantProjectIds(tenantId, customRepositories.tenantProjectRelation);

      const { triggerId } = req.parsed.params;
      const trigger = await services.trigger.getById({ triggerId, projectIds: allowedProjectIds });

      const isManager = await canManageTriggers(tenantId ?? '', session, customRepositories);
      if (!isManager && !isActorAllowed(trigger, session, tenantId ?? '')) {
        ForbiddenResponse(res);
        return;
      }

      if (trigger.triggerType !== 'chefs-form') {
        throw new AppError(400, 'Trigger is not a CHEFS form trigger');
      }

      const meta = trigger.metadata as Record<string, unknown>;
      const formId = meta.formId as string | undefined;
      const formName = (meta.formName as string) ?? '';

      if (!formId) {
        throw new AppError(400, 'Missing formId in trigger metadata');
      }

      if (!WIL_ENCRYPTION_KEY) {
        throw new AppError(500, 'Encryption key not configured');
      }

      const credential = await customRepositories.triggerCredentialRelation.findLinkedCredentialByTriggerIdAndType({
        triggerId,
        type: 'chefs_api_key',
      });

      if (!credential) {
        throw new AppError(400, 'No CHEFS API key credential found for this trigger');
      }

      const formApiKey = decrypt(credential.data as string, WIL_ENCRYPTION_KEY);
      const tokenResult = await services.chefs.getFormToken({ formId, formApiKey });

      OkResponse(
        res,
        { authToken: tokenResult.authToken, formId: tokenResult.formId, formName, baseUrl: tokenResult.baseUrl },
        getTriggerChefsTokenResponseSchema,
      );
    },
  );

  /**
   * POST /wil/triggers/:triggerId/fire — execute a trigger's webhook URL.
   *
   * Accessible to managers and any actor explicitly listed in allowed_actors.
   * Forwards the request to trigger_url using trigger_method, optionally appending
   * the actor's email when includeActorId is set in the trigger's metadata.
   *
   * DEBUGGING THE 401: If you see 401 here, check two things:
   * 1. If the backend logs reach this handler → the 401 is proxied from the trigger_url
   *    itself (the n8n webhook requires authentication). Fix: disable auth on the webhook
   *    in n8n, or use a test webhook that accepts unauthenticated requests.
   * 2. If no server logs appear for this request → the 401 comes from requireUiRequestContext
   *    (session token expired). Fix: refresh the page to obtain a new token.
   */
  router.post(
    '/triggers/:triggerId/fire',
    createRequestParser(fireTriggerSchema),
    async (req: UiApiTypedRequest<z.infer<typeof fireTriggerSchema>>, res: Response) => {
      const session = (req as unknown as { session: UiResolvedSession }).session;
      const tenantId = req.header(X_TENANT_ID_HEADER)?.trim();
      const allowedProjectIds = await resolveTenantProjectIds(tenantId, customRepositories.tenantProjectRelation);

      const { triggerId } = req.parsed.params;
      const trigger = await services.trigger.getById({ triggerId, projectIds: allowedProjectIds });

      const isManager = await canManageTriggers(tenantId ?? '', session, customRepositories);
      if (!isManager && !isActorAllowed(trigger, session, tenantId ?? '')) {
        ForbiddenResponse(res);
        return;
      }

      const meta = trigger.metadata as Record<string, unknown>;
      const includeActorId = (meta.includeActorId as boolean) ?? false;

      // Build the outbound body
      const outboundBody: Record<string, unknown> = {};

      if (trigger.triggerType === 'button' && typeof meta.postBody === 'string' && meta.postBody) {
        try {
          Object.assign(outboundBody, JSON.parse(meta.postBody));
        } catch {
          // postBody is not valid JSON — send as-is under a key
          outboundBody.body = meta.postBody;
        }
      }

      // For CHEFS form triggers, merge any form submission data provided in the request body
      if (trigger.triggerType === 'chefs-form' && req.parsed.body && Object.keys(req.parsed.body).length > 0) {
        Object.assign(outboundBody, req.parsed.body);
      }

      if (includeActorId) {
        outboundBody.actorId = session.email;
      }

      const method = trigger.triggerMethod.toUpperCase();

      let upstreamResponse: globalThis.Response;
      try {
        upstreamResponse = await fetch(trigger.triggerUrl, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'GET' ? undefined : JSON.stringify(outboundBody),
          signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new AppError(504, 'Trigger execution timed out');
        }
        throw new AppError(502, 'Trigger URL unreachable');
      }

      if (!upstreamResponse.ok) {
        const upstreamText = await upstreamResponse.text();
        // Return 502 so the FE always knows the error is from the upstream webhook,
        // not from our authentication layer (which would return 401/403 directly).
        res.status(502).json({
          error: {
            message: upstreamText || `Trigger webhook returned ${upstreamResponse.status}`,
            upstreamStatus: upstreamResponse.status,
          },
        });
        return;
      }

      OkResponse(res, { success: true }, fireTriggerResponseSchema);
    },
  );

  return router;
}
