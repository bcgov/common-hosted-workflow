import { Router, type Request, type Response } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiResolvedSession } from '../helpers/ui-oidc';
import type { UiApiTypedRequest } from '../types/ui-api';
import { resolveWilTenantProjectIds } from './helpers/wil-tenant';
import { createRequestParser } from '../utils/validation';
import {
  listTriggersSchema,
  createTriggerSchema,
  updateTriggerSchema,
  deleteTriggerSchema,
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
import {
  createChefsCredentialResponseSchema,
  createChefsCredentialSchema,
  listChefsCredentialsResponseSchema,
  listChefsCredentialsSchema,
  updateChefsCredentialResponseSchema,
  updateChefsCredentialSchema,
} from '../schemas/chefs-credential';
import { readN8nCredentialId } from '../services/chefs.service';
import type { N8nUserEntity } from '../services/n8n-credentials.service';
import { OkResponse, CreatedResponse, ForbiddenResponse, NoContentResponse } from './responses';
import { AppError } from '../utils/errors';
import {
  TriggerTargetKindEnum,
  WorkflowTriggerTypeEnum,
  WIL_TRIGGER_SOURCES,
  type WilTriggerSource,
} from '../constants/enum';
import { WIL_N8N_NODE_TRIGGERS_ENABLED } from '@config';
import { buildWilTriggerItem } from './helpers/wil-trigger-item';
import { WIL_TARGET_UNAVAILABLE_CODE } from '../services/n8n-workflow-runner.service';
import { createLogger } from '../utils/logger';
import { shortenIdForLog } from '../utils/string';
import { callWebhook } from './helpers/webhook-fire';
import { CALLBACK_TIMEOUT_MS, TRIGGER_MANAGE_ROLE, TRIGGER_FAILED_MESSAGE } from './constants/constants';
import { z } from 'zod';

const log = createLogger('TriggerRoutes');

/** Returns true if the user may create or edit triggers for the given tenant. */
async function canManageTriggers(
  tenantId: string,
  session: UiResolvedSession,
  customRepositories: ApiRouteContext['customRepositories'],
  n8nRepositories: ApiRouteContext['n8nRepositories'],
): Promise<boolean> {
  const tenantRow = await customRepositories.tenantProjectRelation.getRowByTenantId(tenantId);
  if (!tenantRow) return false;
  if (tenantRow.projectType === 'personal') {
    if (!session.n8nUser) return false;
    const personalProject = await n8nRepositories.project.getPersonalProjectForUser(session.n8nUser.id);
    return personalProject?.id === tenantRow.projectId;
  }
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
  if (actorsLower.has('*') || allowedActorsType === 'all') return true;

  if (allowedActorsType === 'user') {
    return actorsLower.has(session.email.toLowerCase());
  }

  if (allowedActorsType === 'role') {
    const tenantRoles = session.tenantRoles.find((tr) => tr.tenantId === tenantId)?.roles ?? [];
    return tenantRoles.some((r) => actorsLower.has(r.toLowerCase()));
  }

  if (allowedActorsType === 'group') {
    const tenantGroups = session.tenantGroups.find((tg) => tg.tenantId === tenantId)?.groups ?? [];
    return tenantGroups.some((g) => actorsLower.has(g.toLowerCase()));
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
  n8nRepositories: ApiRouteContext['n8nRepositories'],
) {
  const session = (req as unknown as { session: UiResolvedSession }).session;
  const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
    req,
    customRepositories.tenantProjectRelation,
  );

  const trigger = await services.trigger.getById({ triggerId, projectIds: allowedProjectIds });

  const isManager = await canManageTriggers(tenantId, session, customRepositories, n8nRepositories);
  if (!isManager && !isActorAllowed(trigger, session, tenantId)) {
    ForbiddenResponse(res);
    return null;
  }

  return { session, tenantId, allowedProjectIds, trigger };
}

/**
 * Mints a CHEFS gateway token for a form trigger.
 * An n8n credential id is resolved server-side. Triggers saved before that
 * reference still use the private API key stored for the trigger.
 */
async function resolveTriggerChefsToken(
  services: ApiRouteContext['services'],
  triggerId: string,
  meta: Record<string, unknown>,
  allowedProjectIds: string[],
) {
  const n8nCredentialId = readN8nCredentialId(meta);
  if (n8nCredentialId) {
    const resolved = await services.chefs.resolveFormCredential({
      credentialId: n8nCredentialId,
      allowedProjectIds,
    });
    const tokenResult = await services.chefs.getFormToken({
      formId: resolved.formId,
      formApiKey: resolved.formApiKey,
      credentialBaseUrl: resolved.baseUrl,
    });
    const formName = resolved.formName ?? (typeof meta.formName === 'string' ? meta.formName : '');
    return { ...tokenResult, formName };
  }

  const formId = typeof meta.formId === 'string' ? meta.formId : '';
  const formName = typeof meta.formName === 'string' ? meta.formName : '';
  const credentialBaseUrl = typeof meta.baseUrl === 'string' && meta.baseUrl.trim() ? meta.baseUrl.trim() : undefined;
  if (!formId) {
    throw new AppError(400, 'Missing formId in trigger metadata');
  }
  const formApiKey = await services.trigger.getChefsApiKeyForTrigger(triggerId);
  const tokenResult = await services.chefs.getFormToken({ formId, formApiKey, credentialBaseUrl });
  return { ...tokenResult, formName };
}

/** Loads the session's n8n user (with role) so n8n's credential permissions apply. */
async function loadN8nUser(
  session: UiResolvedSession,
  n8nRepositories: ApiRouteContext['n8nRepositories'],
): Promise<N8nUserEntity | null> {
  if (!session.n8nUser) return null;
  return await n8nRepositories.user.findByIdWithRole(session.n8nUser.id);
}

/** Tenant scope plus the caller's n8n user; sends 403 when there is no n8n user. */
async function requireCredentialActor(
  req: Request,
  res: Response,
  customRepositories: ApiRouteContext['customRepositories'],
  n8nRepositories: ApiRouteContext['n8nRepositories'],
) {
  const session = (req as unknown as { session: UiResolvedSession }).session;
  const scope = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
  const user = await loadN8nUser(session, n8nRepositories);
  if (!user) {
    ForbiddenResponse(res);
    return null;
  }
  return { user, ...scope };
}

/** Target columns of a create/update body (URL fields only when the kind is 'url'). */
function pickTargetParams(
  body: z.infer<typeof createTriggerSchema>['body'] | z.infer<typeof updateTriggerSchema>['body'],
) {
  return body.targetKind === 'n8n-node'
    ? { targetKind: body.targetKind, targetWorkflowId: body.targetWorkflowId, targetNodeId: body.targetNodeId }
    : { targetKind: body.targetKind, triggerUrl: body.triggerUrl, triggerMethod: body.triggerMethod };
}

/** GET /wil/trigger-targets query. */
const listTriggerTargetsResponseSchema = z.object({
  data: z.array(
    z.object({
      workflowId: z.string(),
      workflowName: z.string(),
      projectId: z.string(),
      nodeId: z.string(),
      nodeName: z.string(),
      label: z.string(),
      description: z.string(),
      acceptedSources: z.array(z.enum(WIL_TRIGGER_SOURCES)),
      inputSource: z.string(),
      inputSchema: z.array(z.object({ name: z.string(), type: z.string() })),
      respondMode: z.string(),
      responseTimeoutSec: z.number(),
    }),
  ),
  enabled: z.boolean(),
});

const listTriggerTargetsSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.object({ source: z.enum(WIL_TRIGGER_SOURCES).optional() }).passthrough(),
  body: z.record(z.string(), z.unknown()).optional(),
});

/** A just-saved n8n-node target was validated against the live published version, so it is live. */
function liveStatusFor(row: { targetKind: string }) {
  return row.targetKind === TriggerTargetKindEnum.N8N_NODE ? ('live' as const) : null;
}

/**
 * Runs the trigger's WIL Trigger node in-process. Re-validates the target on every fire so an
 * unpublished/renamed/removed node fails with 409 instead of running stale configuration.
 */
async function fireN8nNodeTrigger(params: {
  res: Response;
  services: ApiRouteContext['services'];
  trigger: Awaited<ReturnType<ApiRouteContext['services']['trigger']['getById']>>;
  session: UiResolvedSession;
  tenantId: string;
  allowedProjectIds: string[];
  body: Record<string, unknown>;
}): Promise<void> {
  const { res, services, trigger, session, tenantId, allowedProjectIds, body } = params;
  if (!WIL_N8N_NODE_TRIGGERS_ENABLED) throw new AppError(503, 'n8n node triggers are disabled');

  const resolved = await services.triggerTarget.resolve({
    workflowId: trigger.targetWorkflowId ?? '',
    nodeId: trigger.targetNodeId ?? '',
    projectIds: allowedProjectIds,
    source: trigger.triggerType as WilTriggerSource,
  });
  if (!resolved.ok) {
    throw new AppError(409, 'Target workflow is not available', {
      code: WIL_TARGET_UNAVAILABLE_CODE,
      reason: resolved.reason,
    });
  }

  const { target, published } = resolved;
  const started = await services.workflowRunner.start({
    published,
    startNodeId: target.nodeId,
    items: [buildWilTriggerItem({ trigger, session, tenantId, requestBody: body })],
    wait: target.respondMode === 'lastNode' ? { timeoutMs: target.responseTimeoutSec * 1000 } : undefined,
  });

  if (started.status === 'failed') {
    log.warn('WIL trigger run failed', { triggerId: shortenIdForLog(trigger.id), executionId: started.executionId });
    res.status(502).json({ error: { message: TRIGGER_FAILED_MESSAGE, executionId: started.executionId } });
    return;
  }

  const payload = {
    success: true,
    executionId: started.executionId,
    ...(started.status === 'succeeded' ? { result: started.result } : {}),
  };
  // 202: accepted and still running (immediate mode, or lastNode timed out).
  if (started.status === 'dispatched') res.status(202).json(callbackTriggerResponseSchema.parse(payload));
  else OkResponse(res, payload, callbackTriggerResponseSchema);
}

export function buildTriggerRouter(routeContext: ApiRouteContext) {
  const { services, customRepositories, n8nRepositories } = routeContext;
  const router = Router();

  /**
   * GET /wil/triggers — list triggers for the tenant.
   * project:editor users receive full trigger data.
   * All other authenticated users receive only display name, type, and actor access fields,
   * and only for triggers they are explicitly allowed to fire.
   */
  router.get('/triggers', createRequestParser(listTriggersSchema), async (req: Request, res: Response) => {
    const session = (req as unknown as { session: UiResolvedSession }).session;
    const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
      req,
      customRepositories.tenantProjectRelation,
    );

    const isManager = await canManageTriggers(tenantId, session, customRepositories, n8nRepositories);
    const rows = await services.trigger.list({ projectIds: allowedProjectIds });
    const statuses = await services.triggerTarget.statuses(rows);

    if (isManager) {
      const chefsFormIds = rows.filter((r) => r.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM).map((r) => r.id);
      const triggerIdsWithCreds =
        chefsFormIds.length > 0
          ? await customRepositories.triggerCredentialRelation.listTriggerIdsWithCredentials(chefsFormIds)
          : new Set<string>();

      OkResponse(
        res,
        {
          data: rows.map((r) => mapTriggerRowToResponse(r, triggerIdsWithCreds.has(r.id), statuses.get(r.id) ?? null)),
        },
        listTriggersResponseSchema,
      );
    } else {
      const visibleRows = rows.filter((r) => isActorAllowed(r, session, tenantId));
      OkResponse(
        res,
        { data: visibleRows.map((r) => mapTriggerRowToLimitedResponse(r, statuses.get(r.id) ?? null)) },
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
      const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
        req,
        customRepositories.tenantProjectRelation,
      );

      const allowed = await canManageTriggers(tenantId, session, customRepositories, n8nRepositories);
      if (!allowed) {
        ForbiddenResponse(res);
        return;
      }

      const { triggerType, metadata, allowedActorsType, allowedActors, authEnabled, createdBy } = req.parsed.body;

      const n8nUser = await loadN8nUser(session, n8nRepositories);
      const row = await services.trigger.create({
        projectId: allowedProjectIds[0],
        allowedProjectIds,
        triggerType,
        ...pickTargetParams(req.parsed.body),
        metadata,
        allowedActorsType,
        allowedActors,
        authEnabled,
        createdBy: createdBy ?? session.email ?? null,
        n8nUser,
      });

      const triggerIdsWithCreds =
        row.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM
          ? await customRepositories.triggerCredentialRelation.listTriggerIdsWithCredentials([row.id])
          : new Set<string>();

      CreatedResponse(
        res,
        mapTriggerRowToResponse(row, triggerIdsWithCreds.has(row.id), liveStatusFor(row)),
        createTriggerResponseSchema,
      );
    },
  );

  /** PUT /wil/triggers/:triggerId — update a trigger's metadata, actors, and authEnabled. */
  router.put(
    '/triggers/:triggerId',
    createRequestParser(updateTriggerSchema),
    async (req: UiApiTypedRequest<z.infer<typeof updateTriggerSchema>>, res: Response) => {
      const session = (req as unknown as { session: UiResolvedSession }).session;
      const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
        req,
        customRepositories.tenantProjectRelation,
      );

      const allowed = await canManageTriggers(tenantId, session, customRepositories, n8nRepositories);
      if (!allowed) {
        ForbiddenResponse(res);
        return;
      }

      const { triggerId } = req.parsed.params;
      const { metadata, allowedActorsType, allowedActors, authEnabled, updatedBy } = req.parsed.body;

      const n8nUser = await loadN8nUser(session, n8nRepositories);
      const row = await services.trigger.update({
        triggerId,
        projectIds: allowedProjectIds,
        ...pickTargetParams(req.parsed.body),
        metadata,
        allowedActorsType,
        allowedActors,
        authEnabled,
        updatedBy: updatedBy ?? session.email ?? '',
        n8nUser,
      });

      const triggerIdsWithCreds =
        row.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM
          ? await customRepositories.triggerCredentialRelation.listTriggerIdsWithCredentials([row.id])
          : new Set<string>();

      OkResponse(
        res,
        mapTriggerRowToResponse(row, triggerIdsWithCreds.has(row.id), liveStatusFor(row)),
        updateTriggerResponseSchema,
      );
    },
  );

  /** DELETE /wil/triggers/:triggerId — permanently deletes a trigger. Requires project:editor role. */
  router.delete(
    '/triggers/:triggerId',
    createRequestParser(deleteTriggerSchema),
    async (req: UiApiTypedRequest<z.infer<typeof deleteTriggerSchema>>, res: Response) => {
      const session = (req as unknown as { session: UiResolvedSession }).session;
      const { tenantId, projectIds: allowedProjectIds } = await resolveWilTenantProjectIds(
        req,
        customRepositories.tenantProjectRelation,
      );

      const allowed = await canManageTriggers(tenantId, session, customRepositories, n8nRepositories);
      if (!allowed) {
        ForbiddenResponse(res);
        return;
      }

      const { triggerId } = req.parsed.params;
      await services.trigger.delete({ triggerId, projectIds: allowedProjectIds });
      NoContentResponse(res);
    },
  );

  /**
   * GET /wil/trigger-targets?source=button|chefs-form — published workflows in the tenant's projects
   * that contain an enabled WIL Trigger node accepting the source. Manager-only (feeds the editor dropdown).
   */
  router.get(
    '/trigger-targets',
    createRequestParser(listTriggerTargetsSchema),
    async (req: UiApiTypedRequest<z.infer<typeof listTriggerTargetsSchema>>, res: Response) => {
      const session = (req as unknown as { session: UiResolvedSession }).session;
      const { tenantId, projectIds } = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
      if (!(await canManageTriggers(tenantId, session, customRepositories, n8nRepositories))) {
        ForbiddenResponse(res);
        return;
      }
      const targets = WIL_N8N_NODE_TRIGGERS_ENABLED
        ? await services.triggerTarget.list({
            projectIds,
            source: req.parsed.query.source as WilTriggerSource | undefined,
          })
        : [];
      OkResponse(res, { data: targets, enabled: WIL_N8N_NODE_TRIGGERS_ENABLED }, listTriggerTargetsResponseSchema);
    },
  );

  /**
   * GET /wil/chefs-credentials — chefsFormAuth credentials the caller may read in n8n,
   * limited to this tenant's projects, plus whether they may create one. No API keys.
   */
  router.get(
    '/chefs-credentials',
    createRequestParser(listChefsCredentialsSchema),
    async (req: Request, res: Response) => {
      const actor = await requireCredentialActor(req, res, customRepositories, n8nRepositories);
      if (!actor) return;
      const { credentials, canCreate } = await services.chefs.listFormCredentials(actor.user, actor.projectIds);
      OkResponse(res, { data: credentials, canCreate }, listChefsCredentialsResponseSchema);
    },
  );

  /**
   * POST /wil/chefs-credentials — creates a chefsFormAuth credential through n8n, owned by
   * the tenant's first project (n8n checks credential:create). The API key is not returned.
   */
  router.post(
    '/chefs-credentials',
    createRequestParser(createChefsCredentialSchema),
    async (req: UiApiTypedRequest<z.infer<typeof createChefsCredentialSchema>>, res: Response) => {
      const actor = await requireCredentialActor(req, res, customRepositories, n8nRepositories);
      if (!actor) return;
      const created = await services.chefs.createFormCredential(actor.user, {
        ...req.parsed.body,
        projectId: actor.projectIds[0],
      });
      CreatedResponse(res, created, createChefsCredentialResponseSchema);
    },
  );

  /**
   * PATCH /wil/chefs-credentials/:credentialId — updates a chefsFormAuth credential through
   * n8n (requires credential:update); an omitted API key keeps the stored one.
   */
  router.patch(
    '/chefs-credentials/:credentialId',
    createRequestParser(updateChefsCredentialSchema),
    async (req: UiApiTypedRequest<z.infer<typeof updateChefsCredentialSchema>>, res: Response) => {
      const actor = await requireCredentialActor(req, res, customRepositories, n8nRepositories);
      if (!actor) return;
      const updated = await services.chefs.updateFormCredential(actor.user, {
        credentialId: req.parsed.params.credentialId,
        allowedProjectIds: actor.projectIds,
        ...req.parsed.body,
      });
      OkResponse(res, updated, updateChefsCredentialResponseSchema);
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
      const ctx = await resolveTriggerAccess(req, res, triggerId, services, customRepositories, n8nRepositories);
      if (!ctx) return;
      const { trigger } = ctx;

      if (trigger.triggerType !== WorkflowTriggerTypeEnum.CHEFS_FORM) {
        throw new AppError(400, 'Trigger is not a CHEFS form trigger');
      }

      const meta = trigger.metadata as Record<string, unknown>;
      // A credential belongs to one project; only the trigger's own project may use it.
      const tokenResult = await resolveTriggerChefsToken(services, triggerId, meta, [trigger.projectId]);
      const formName = tokenResult.formName;

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
      const ctx = await resolveTriggerAccess(req, res, triggerId, services, customRepositories, n8nRepositories);
      if (!ctx) return;
      const { session, tenantId, allowedProjectIds, trigger } = ctx;

      if (trigger.targetKind === TriggerTargetKindEnum.N8N_NODE) {
        await fireN8nNodeTrigger({
          res,
          services,
          trigger,
          session,
          tenantId,
          allowedProjectIds,
          body: (req.parsed.body ?? {}) as Record<string, unknown>,
        });
        return;
      }

      const outboundBody = buildTriggerOutboundBody(
        trigger,
        (req.parsed.body ?? {}) as Record<string, unknown>,
        session.email,
      );

      const triggerUrl = trigger.triggerUrl ?? '';
      const method = (trigger.triggerMethod ?? 'POST').toUpperCase();
      const requestUrl =
        method === 'GET' && Object.keys(outboundBody).length > 0
          ? appendBodyAsQueryParams(triggerUrl, outboundBody)
          : triggerUrl;

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
