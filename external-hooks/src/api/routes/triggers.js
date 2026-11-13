'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildTriggerRouter = buildTriggerRouter;
const express_1 = require('express');
const wil_tenant_1 = require('./helpers/wil-tenant');
const validation_1 = require('../utils/validation');
const trigger_1 = require('../schemas/trigger');
const chefs_credential_1 = require('../schemas/chefs-credential');
const chefs_service_1 = require('../services/chefs.service');
const responses_1 = require('./responses');
const errors_1 = require('../utils/errors');
const enum_1 = require('../constants/enum');
const _config_1 = require('@config');
const wil_trigger_item_1 = require('./helpers/wil-trigger-item');
const n8n_workflow_runner_service_1 = require('../services/n8n-workflow-runner.service');
const logger_1 = require('../utils/logger');
const string_1 = require('../utils/string');
const constants_1 = require('./constants/constants');
const zod_1 = require('zod');
const log = (0, logger_1.createLogger)('TriggerRoutes');
/** Returns true if the user may create or edit triggers for the given tenant. */
async function canManageTriggers(tenantId, session, customRepositories, n8nRepositories) {
  const tenantRow = await customRepositories.tenantProjectRelation.getRowByTenantId(tenantId);
  if (!tenantRow) return false;
  if (tenantRow.projectType === 'personal') {
    if (!session.n8nUser) return false;
    const personalProject = await n8nRepositories.project.getPersonalProjectForUser(session.n8nUser.id);
    return personalProject?.id === tenantRow.projectId;
  }
  return session.tenantRoles.some(
    (tr) => tr.tenantId === tenantId && tr.roles.includes(constants_1.TRIGGER_MANAGE_ROLE),
  );
}
/**
 * Returns true if the actor (session user) is explicitly allowed to fire a trigger,
 * based on the trigger's allowed_actors_type and allowed_actors.
 */
function isActorAllowed(trigger, session, tenantId) {
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
 * Resolves the trigger for the given triggerId, checks that the caller is either a manager
 * or an explicitly allowed actor, and sends a 403 + returns null if not.
 * Returns the session, tenantId, and trigger row on success.
 */
async function resolveTriggerAccess(req, res, triggerId, services, customRepositories, n8nRepositories) {
  const session = req.session;
  const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(
    req,
    customRepositories.tenantProjectRelation,
  );
  const trigger = await services.trigger.getById({ triggerId, projectIds: allowedProjectIds });
  const isManager = await canManageTriggers(tenantId, session, customRepositories, n8nRepositories);
  if (!isManager && !isActorAllowed(trigger, session, tenantId)) {
    (0, responses_1.ForbiddenResponse)(res);
    return null;
  }
  return { session, tenantId, allowedProjectIds, trigger };
}
/**
 * Mints a CHEFS gateway token for a form trigger. The form's API key is resolved
 * server-side from the n8n `chefsFormAuth` credential named in the trigger metadata.
 */
async function resolveTriggerChefsToken(services, meta, allowedProjectIds) {
  const n8nCredentialId = (0, chefs_service_1.readN8nCredentialId)(meta);
  if (!n8nCredentialId) {
    throw new errors_1.AppError(400, 'Select a CHEFS credential for this trigger');
  }
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
/** Loads the session's n8n user (with role) so n8n's credential permissions apply. */
async function loadN8nUser(session, n8nRepositories) {
  if (!session.n8nUser) return null;
  return await n8nRepositories.user.findByIdWithRole(session.n8nUser.id);
}
/** Tenant scope plus the caller's n8n user; sends 403 when there is no n8n user. */
async function requireCredentialActor(req, res, customRepositories, n8nRepositories) {
  const session = req.session;
  const scope = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, customRepositories.tenantProjectRelation);
  const user = await loadN8nUser(session, n8nRepositories);
  if (!user) {
    (0, responses_1.ForbiddenResponse)(res);
    return null;
  }
  return { user, ...scope };
}
/** Target columns of a create/update body (always an n8n-node target). */
function pickTargetParams(body) {
  return { targetKind: body.targetKind, targetWorkflowId: body.targetWorkflowId, targetNodeId: body.targetNodeId };
}
/** GET /wil/trigger-targets query. */
const listTriggerTargetsResponseSchema = zod_1.z.object({
  data: zod_1.z.array(
    zod_1.z.object({
      workflowId: zod_1.z.string(),
      workflowName: zod_1.z.string(),
      projectId: zod_1.z.string(),
      nodeId: zod_1.z.string(),
      nodeName: zod_1.z.string(),
      label: zod_1.z.string(),
      description: zod_1.z.string(),
      acceptedSources: zod_1.z.array(zod_1.z.enum(enum_1.WIL_TRIGGER_SOURCES)),
      inputSource: zod_1.z.string(),
      inputSchema: zod_1.z.array(zod_1.z.object({ name: zod_1.z.string(), type: zod_1.z.string() })),
      respondMode: zod_1.z.string(),
      responseTimeoutSec: zod_1.z.number(),
    }),
  ),
  enabled: zod_1.z.boolean(),
});
const listTriggerTargetsSchema = zod_1.z.object({
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.object({ source: zod_1.z.enum(enum_1.WIL_TRIGGER_SOURCES).optional() }).passthrough(),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** A just-saved n8n-node target was validated against the live published version, so it is live. */
function liveStatusFor(row) {
  return row.targetKind === enum_1.TriggerTargetKindEnum.N8N_NODE ? 'live' : null;
}
/**
 * Runs the trigger's WIL Trigger node in-process. Re-validates the target on every fire so an
 * unpublished/renamed/removed node fails with 409 instead of running stale configuration.
 */
async function fireN8nNodeTrigger(params) {
  const { res, services, trigger, session, tenantId, allowedProjectIds, body } = params;
  if (!_config_1.WIL_N8N_NODE_TRIGGERS_ENABLED) throw new errors_1.AppError(503, 'n8n node triggers are disabled');
  const resolved = await services.triggerTarget.resolve({
    workflowId: trigger.targetWorkflowId ?? '',
    nodeId: trigger.targetNodeId ?? '',
    projectIds: allowedProjectIds,
    source: trigger.triggerType,
  });
  if (!resolved.ok) {
    throw new errors_1.AppError(409, 'Target workflow is not available', {
      code: n8n_workflow_runner_service_1.WIL_TARGET_UNAVAILABLE_CODE,
      reason: resolved.reason,
    });
  }
  const { target, published } = resolved;
  const started = await services.workflowRunner.start({
    published,
    startNodeId: target.nodeId,
    items: [(0, wil_trigger_item_1.buildWilTriggerItem)({ trigger, session, tenantId, requestBody: body })],
    wait: target.respondMode === 'lastNode' ? { timeoutMs: target.responseTimeoutSec * 1000 } : undefined,
  });
  if (started.status === 'failed') {
    log.warn('WIL trigger run failed', {
      triggerId: (0, string_1.shortenIdForLog)(trigger.id),
      executionId: started.executionId,
    });
    res.status(502).json({ error: { message: constants_1.TRIGGER_FAILED_MESSAGE, executionId: started.executionId } });
    return;
  }
  const payload = {
    success: true,
    executionId: started.executionId,
    ...(started.status === 'succeeded' ? { result: started.result } : {}),
  };
  // 202: accepted and still running (immediate mode, or lastNode timed out).
  if (started.status === 'dispatched') res.status(202).json(trigger_1.callbackTriggerResponseSchema.parse(payload));
  else (0, responses_1.OkResponse)(res, payload, trigger_1.callbackTriggerResponseSchema);
}
function buildTriggerRouter(routeContext) {
  const { services, customRepositories, n8nRepositories } = routeContext;
  const router = (0, express_1.Router)();
  /**
   * GET /wil/triggers — list triggers for the tenant.
   * project:editor users receive full trigger data.
   * All other authenticated users receive only display name, type, and actor access fields,
   * and only for triggers they are explicitly allowed to fire.
   */
  router.get('/triggers', (0, validation_1.createRequestParser)(trigger_1.listTriggersSchema), async (req, res) => {
    const session = req.session;
    const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(
      req,
      customRepositories.tenantProjectRelation,
    );
    const isManager = await canManageTriggers(tenantId, session, customRepositories, n8nRepositories);
    const rows = await services.trigger.list({ projectIds: allowedProjectIds });
    const statuses = await services.triggerTarget.statuses(rows, allowedProjectIds);
    if (isManager) {
      (0, responses_1.OkResponse)(
        res,
        { data: rows.map((r) => (0, trigger_1.mapTriggerRowToResponse)(r, statuses.get(r.id) ?? null)) },
        trigger_1.listTriggersResponseSchema,
      );
    } else {
      const visibleRows = rows.filter((r) => isActorAllowed(r, session, tenantId));
      (0, responses_1.OkResponse)(
        res,
        { data: visibleRows.map((r) => (0, trigger_1.mapTriggerRowToLimitedResponse)(r, statuses.get(r.id) ?? null)) },
        trigger_1.listTriggersLimitedResponseSchema,
      );
    }
  });
  /** POST /wil/triggers — create a trigger. Requires project:editor role or personal project. */
  router.post('/triggers', (0, validation_1.createRequestParser)(trigger_1.createTriggerSchema), async (req, res) => {
    const session = req.session;
    const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(
      req,
      customRepositories.tenantProjectRelation,
    );
    const allowed = await canManageTriggers(tenantId, session, customRepositories, n8nRepositories);
    if (!allowed) {
      (0, responses_1.ForbiddenResponse)(res);
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
    (0, responses_1.CreatedResponse)(
      res,
      (0, trigger_1.mapTriggerRowToResponse)(row, liveStatusFor(row)),
      trigger_1.createTriggerResponseSchema,
    );
  });
  /** PUT /wil/triggers/:triggerId — update a trigger's metadata, actors, and authEnabled. */
  router.put(
    '/triggers/:triggerId',
    (0, validation_1.createRequestParser)(trigger_1.updateTriggerSchema),
    async (req, res) => {
      const session = req.session;
      const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(
        req,
        customRepositories.tenantProjectRelation,
      );
      const allowed = await canManageTriggers(tenantId, session, customRepositories, n8nRepositories);
      if (!allowed) {
        (0, responses_1.ForbiddenResponse)(res);
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
      (0, responses_1.OkResponse)(
        res,
        (0, trigger_1.mapTriggerRowToResponse)(row, liveStatusFor(row)),
        trigger_1.updateTriggerResponseSchema,
      );
    },
  );
  /** DELETE /wil/triggers/:triggerId — permanently deletes a trigger. Requires project:editor role. */
  router.delete(
    '/triggers/:triggerId',
    (0, validation_1.createRequestParser)(trigger_1.deleteTriggerSchema),
    async (req, res) => {
      const session = req.session;
      const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(
        req,
        customRepositories.tenantProjectRelation,
      );
      const allowed = await canManageTriggers(tenantId, session, customRepositories, n8nRepositories);
      if (!allowed) {
        (0, responses_1.ForbiddenResponse)(res);
        return;
      }
      const { triggerId } = req.parsed.params;
      await services.trigger.delete({ triggerId, projectIds: allowedProjectIds });
      (0, responses_1.NoContentResponse)(res);
    },
  );
  /**
   * GET /wil/trigger-targets?source=button|chefs-form — published workflows in the tenant's projects
   * that contain an enabled WIL Trigger node accepting the source. Manager-only (feeds the editor dropdown).
   */
  router.get('/trigger-targets', (0, validation_1.createRequestParser)(listTriggerTargetsSchema), async (req, res) => {
    const session = req.session;
    const { tenantId, projectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(
      req,
      customRepositories.tenantProjectRelation,
    );
    if (!(await canManageTriggers(tenantId, session, customRepositories, n8nRepositories))) {
      (0, responses_1.ForbiddenResponse)(res);
      return;
    }
    const targets = _config_1.WIL_N8N_NODE_TRIGGERS_ENABLED
      ? await services.triggerTarget.list({
          projectIds,
          source: req.parsed.query.source,
        })
      : [];
    (0, responses_1.OkResponse)(
      res,
      { data: targets, enabled: _config_1.WIL_N8N_NODE_TRIGGERS_ENABLED },
      listTriggerTargetsResponseSchema,
    );
  });
  /**
   * GET /wil/chefs-credentials — chefsFormAuth credentials the caller may read in n8n,
   * limited to this tenant's projects, plus whether they may create one. No API keys.
   */
  router.get(
    '/chefs-credentials',
    (0, validation_1.createRequestParser)(chefs_credential_1.listChefsCredentialsSchema),
    async (req, res) => {
      const actor = await requireCredentialActor(req, res, customRepositories, n8nRepositories);
      if (!actor) return;
      const { credentials, canCreate } = await services.chefs.listFormCredentials(actor.user, actor.projectIds);
      (0, responses_1.OkResponse)(
        res,
        { data: credentials, canCreate },
        chefs_credential_1.listChefsCredentialsResponseSchema,
      );
    },
  );
  /**
   * POST /wil/chefs-credentials — creates a chefsFormAuth credential through n8n, owned by
   * the tenant's first project (n8n checks credential:create). The API key is not returned.
   */
  router.post(
    '/chefs-credentials',
    (0, validation_1.createRequestParser)(chefs_credential_1.createChefsCredentialSchema),
    async (req, res) => {
      const actor = await requireCredentialActor(req, res, customRepositories, n8nRepositories);
      if (!actor) return;
      const created = await services.chefs.createFormCredential(actor.user, {
        ...req.parsed.body,
        projectId: actor.projectIds[0],
      });
      (0, responses_1.CreatedResponse)(res, created, chefs_credential_1.createChefsCredentialResponseSchema);
    },
  );
  /**
   * PATCH /wil/chefs-credentials/:credentialId — updates a chefsFormAuth credential through
   * n8n (requires credential:update); an omitted API key keeps the stored one.
   */
  router.patch(
    '/chefs-credentials/:credentialId',
    (0, validation_1.createRequestParser)(chefs_credential_1.updateChefsCredentialSchema),
    async (req, res) => {
      const actor = await requireCredentialActor(req, res, customRepositories, n8nRepositories);
      if (!actor) return;
      const updated = await services.chefs.updateFormCredential(actor.user, {
        credentialId: req.parsed.params.credentialId,
        allowedProjectIds: actor.projectIds,
        ...req.parsed.body,
      });
      (0, responses_1.OkResponse)(res, updated, chefs_credential_1.updateChefsCredentialResponseSchema);
    },
  );
  /**
   * POST /wil/triggers/:triggerId/chefs-token — returns a CHEFS auth token for the trigger's form.
   * Requires the actor to be allowed to fire the trigger (same permission as the fire endpoint).
   */
  router.post(
    '/triggers/:triggerId/chefs-token',
    (0, validation_1.createRequestParser)(trigger_1.getTriggerChefsTokenSchema),
    async (req, res) => {
      const { triggerId } = req.parsed.params;
      const ctx = await resolveTriggerAccess(req, res, triggerId, services, customRepositories, n8nRepositories);
      if (!ctx) return;
      const { trigger } = ctx;
      if (trigger.triggerType !== enum_1.WorkflowTriggerTypeEnum.CHEFS_FORM) {
        throw new errors_1.AppError(400, 'Trigger is not a CHEFS form trigger');
      }
      const meta = trigger.metadata;
      // A credential belongs to one project; only the trigger's own project may use it.
      const tokenResult = await resolveTriggerChefsToken(services, meta, [trigger.projectId]);
      const formName = tokenResult.formName;
      (0, responses_1.OkResponse)(
        res,
        { authToken: tokenResult.authToken, formId: tokenResult.formId, formName, baseUrl: tokenResult.baseUrl },
        trigger_1.getTriggerChefsTokenResponseSchema,
      );
    },
  );
  /**
   * POST /wil/triggers/:triggerId/callback — fire a trigger's WIL Trigger node in the published workflow.
   *
   * Accessible to managers and any actor explicitly listed in allowed_actors.
   * The actor's email, roles and groups are passed to the WIL Trigger node as data.
   */
  router.post(
    '/triggers/:triggerId/callback',
    (0, validation_1.createRequestParser)(trigger_1.callbackTriggerSchema),
    async (req, res) => {
      const { triggerId } = req.parsed.params;
      const ctx = await resolveTriggerAccess(req, res, triggerId, services, customRepositories, n8nRepositories);
      if (!ctx) return;
      const { session, tenantId, allowedProjectIds, trigger } = ctx;
      await fireN8nNodeTrigger({
        res,
        services,
        trigger,
        session,
        tenantId,
        allowedProjectIds,
        body: req.parsed.body ?? {},
      });
    },
  );
  return router;
}
