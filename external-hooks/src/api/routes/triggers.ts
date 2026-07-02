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
  callbackTriggerSchema,
  getTriggerChefsTokenSchema,
  getTriggerChefsTokenResponseSchema,
  mapTriggerRowToResponse,
  mapTriggerRowToLimitedResponse,
  listTriggersResponseSchema,
  listTriggersLimitedResponseSchema,
  createTriggerResponseSchema,
  updateTriggerResponseSchema,
  callbackTriggerResponseSchema,
} from '../schemas/trigger';
import { OkResponse, CreatedResponse, ForbiddenResponse } from './responses';
import { AppError } from '../utils/errors';
import { X_TENANT_ID_HEADER } from '../constants/headers';
import { WorkflowTriggerTypeEnum } from '../constants/enum';
import { createLogger } from '../utils/logger';
import { shortenIdForLog } from '../utils/string';
import { callWebhook } from './helpers/webhook-fire';
import { CALLBACK_TIMEOUT_MS, TRIGGER_MANAGE_ROLE, TRIGGER_FAILED_MESSAGE } from './constants/constants';
import type { z } from 'zod';

const log = createLogger('TriggerRoutes');

/** Returns true if the user may create or edit triggers for the given tenant. */
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

/**
 * Builds the outbound request body for a trigger callback.
 * actorId is always included so downstream workflows can identify the initiating user.
 */
function buildTriggerOutboundBody(
  trigger: { triggerType: string; metadata: Record<string, unknown> },
  requestBody: Record<string, unknown>,
  actorEmail: string,
): Record<string, unknown> {
  const outbound: Record<string, unknown> = {};
  const meta = trigger.metadata;

  if (trigger.triggerType === WorkflowTriggerTypeEnum.BUTTON && typeof meta.postBody === 'string' && meta.postBody) {
    try {
      Object.assign(outbound, JSON.parse(meta.postBody));
    } catch {
      outbound.body = meta.postBody;
    }
  }

  if (trigger.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM && Object.keys(requestBody).length > 0) {
    Object.assign(outbound, requestBody);
  }

  outbound.actorId = actorEmail;

  return outbound;
}

/** Appends body fields as query params for GET requests; returns the modified URL string. */
function appendBodyAsQueryParams(baseUrl: string, body: Record<string, unknown>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(body)) {
    url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return url.toString();
}

/**
 * Resolves the trigger for the given triggerId, checks that the caller is either a manager
 * or an explicitly allowed actor, and sends a 403 + returns null if not.
 * Returns the session, tenantId, and trigger row on success.
 */
async function resolveTriggerAccess(
  req: Request,
  res: Response,
  triggerId: string,
  services: ApiRouteContext['services'],
  customRepositories: ApiRouteContext['customRepositories'],
) {
  const session = (req as unknown as { session: UiResolvedSession }).session;
  const tenantId = req.header(X_TENANT_ID_HEADER)?.trim() ?? '';
  const allowedProjectIds = await resolveTenantProjectIds(tenantId, customRepositories.tenantProjectRelation);

  const trigger = await services.trigger.getById({ triggerId, projectIds: allowedProjectIds });

  const isManager = await canManageTriggers(tenantId, session, customRepositories);
  if (!isManager && !isActorAllowed(trigger, session, tenantId)) {
    ForbiddenResponse(res);
    return null;
  }

  return { session, tenantId, trigger };
}

export function buildTriggerRouter(routeContext: ApiRouteContext) {
  const { services, customRepositories } = routeContext;
  const router = Router();

  /**
   * GET /wil/triggers — list triggers for the tenant.
   * project:editor users receive full trigger data.
   * All other authenticated users receive only display name, type, and actor access fields,
   * and only for triggers they are explicitly allowed to fire.
   */
  router.get('/triggers', createRequestParser(listTriggersSchema), async (req: Request, res: Response) => {
    const session = (req as unknown as { session: UiResolvedSession }).session;
    const tenantId = req.header(X_TENANT_ID_HEADER)?.trim() ?? '';
    const { projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
      req,
      customRepositories.tenantProjectRelation,
    );

    const isManager = await canManageTriggers(tenantId, session, customRepositories);
    const rows = await services.trigger.list({ projectIds: allowedProjectIds });

    if (isManager) {
      const chefsFormIds = rows.filter((r) => r.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM).map((r) => r.id);
      const triggerIdsWithCreds =
        chefsFormIds.length > 0
          ? await customRepositories.triggerCredentialRelation.listTriggerIdsWithCredentials(chefsFormIds)
          : new Set<string>();

      OkResponse(
        res,
        { data: rows.map((r) => mapTriggerRowToResponse(r, triggerIdsWithCreds.has(r.id))) },
        listTriggersResponseSchema,
      );
    } else {
      const visibleRows = rows.filter((r) => isActorAllowed(r, session, tenantId));
      OkResponse(
        res,
        { data: visibleRows.map((r) => mapTriggerRowToLimitedResponse(r)) },
        listTriggersLimitedResponseSchema,
      );
    }
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

      const triggerIdsWithCreds =
        row.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM
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

      const triggerIdsWithCreds =
        row.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM
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
      const { triggerId } = req.parsed.params;
      const ctx = await resolveTriggerAccess(req, res, triggerId, services, customRepositories);
      if (!ctx) return;
      const { trigger } = ctx;

      if (trigger.triggerType !== WorkflowTriggerTypeEnum.CHEFS_FORM) {
        throw new AppError(400, 'Trigger is not a CHEFS form trigger');
      }

      const meta = trigger.metadata as Record<string, unknown>;
      const formId = meta.formId as string | undefined;
      const formName = (meta.formName as string) ?? '';

      if (!formId) {
        throw new AppError(400, 'Missing formId in trigger metadata');
      }

      const formApiKey = await services.trigger.getChefsApiKeyForTrigger(triggerId);
      const tokenResult = await services.chefs.getFormToken({ formId, formApiKey });

      OkResponse(
        res,
        { authToken: tokenResult.authToken, formId: tokenResult.formId, formName, baseUrl: tokenResult.baseUrl },
        getTriggerChefsTokenResponseSchema,
      );
    },
  );

  /**
   * POST /wil/triggers/:triggerId/callback — execute a trigger's webhook URL.
   *
   * Accessible to managers and any actor explicitly listed in allowed_actors.
   * Always appends the actor's email as actorId so downstream workflows can identify the initiator.
   * For GET triggers, body fields are forwarded as query params instead.
   */
  router.post(
    '/triggers/:triggerId/callback',
    createRequestParser(callbackTriggerSchema),
    async (req: UiApiTypedRequest<z.infer<typeof callbackTriggerSchema>>, res: Response) => {
      const { triggerId } = req.parsed.params;
      const ctx = await resolveTriggerAccess(req, res, triggerId, services, customRepositories);
      if (!ctx) return;
      const { session, trigger } = ctx;

      const outboundBody = buildTriggerOutboundBody(
        trigger,
        (req.parsed.body ?? {}) as Record<string, unknown>,
        session.email,
      );

      const method = trigger.triggerMethod.toUpperCase();
      const requestUrl =
        method === 'GET' && Object.keys(outboundBody).length > 0
          ? appendBodyAsQueryParams(trigger.triggerUrl, outboundBody)
          : trigger.triggerUrl;

      const upstream = await callWebhook({
        url: requestUrl,
        method,
        body: method === 'GET' ? undefined : JSON.stringify(outboundBody),
        timeoutMs: CALLBACK_TIMEOUT_MS,
        timeoutMessage: 'Trigger execution timed out',
        unreachableMessage: 'Trigger URL unreachable',
      });

      if (!upstream.ok) {
        const upstreamText = await upstream.text();
        log.warn('Trigger webhook returned an error response', {
          triggerId: shortenIdForLog(triggerId),
          status: upstream.status,
          upstreamText,
        });
        res.status(502).json({
          error: {
            message: TRIGGER_FAILED_MESSAGE,
            upstreamStatus: upstream.status,
          },
        });
        return;
      }

      OkResponse(res, { success: true }, callbackTriggerResponseSchema);
    },
  );

  return router;
}
