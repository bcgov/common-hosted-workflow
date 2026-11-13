'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildActionRouter = buildActionRouter;
const express_1 = require('express');
const list_query_1 = require('../helpers/list-query');
const responses_1 = require('./responses');
const tenant_scope_1 = require('./helpers/tenant-scope');
const patch_action_set_values_1 = require('./helpers/patch-action-set-values');
const action_request_1 = require('../schemas/action-request');
const validation_1 = require('../utils/validation');
function buildActionRouter({ apiKeyAuthMiddleware, workflowInteractionTenantMiddleware, services }) {
  const router = (0, express_1.Router)();
  router.post(
    '/actions',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    (0, validation_1.createRequestSchemaValidator)(action_request_1.createActionRequestSchema),
    async (req, res) => {
      const parsed = (0, validation_1.parseValidatedRequest)(action_request_1.createActionRequestSchema, req);
      const body = parsed.body;
      const allowedProjectIds = (0, tenant_scope_1.getTenantScopedProjectIds)(res, 'POST /v1/actions', 'actions');
      const created = await services.action.create({
        allowedProjectIds,
        actionType: body.actionType,
        actionTitle: body.actionTitle ?? null,
        payload: body.payload,
        callbackUrl: body.callbackUrl,
        callbackMethod: body.callbackMethod,
        callbackPayloadSpec: body.callbackPayloadSpec,
        actorId: body.actorId,
        actorType: body.actorType,
        workflowInstanceId: body.workflowInstanceId,
        workflowId: body.workflowId,
        status: body.status,
        priority: body.priority,
        dueDate: body.dueDate,
        checkIn: body.checkIn,
        metadata: body.metadata,
      });
      (0, responses_1.CreatedResponse)(
        res,
        (0, action_request_1.mapActionRequestRowToResponse)(created),
        action_request_1.createActionRequestResponseSchema,
      );
    },
  );
  router.get(
    '/actions',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    (0, validation_1.createRequestSchemaValidator)(action_request_1.listActionsSchema),
    async (req, res) => {
      const parsed = (0, validation_1.parseValidatedRequest)(action_request_1.listActionsSchema, req);
      const allowedProjectIds = (0, tenant_scope_1.getTenantScopedProjectIds)(res, 'GET /v1/actions', 'actions');
      const { actorId, since, limit, workflowInstanceId } = parsed.query;
      const pageLimit = limit ?? 50;
      const rawRows = await services.action.list({
        allowedProjectIds,
        actorId,
        workflowInstanceId,
        limit: pageLimit,
        since,
      });
      const { rows, hasMore } = (0, list_query_1.paginateOverfetchedRows)(rawRows, pageLimit);
      const items = rows.map(action_request_1.mapActionRequestRowToResponse);
      const nextCursor = (0, list_query_1.nextCursorFromPagedItems)(items, hasMore);
      (0, responses_1.OkResponse)(res, { items, nextCursor }, action_request_1.listActionsResponseSchema);
    },
  );
  router.get(
    '/actions/:actionId',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    (0, validation_1.createRequestSchemaValidator)(action_request_1.getActionByIdSchema),
    async (req, res) => {
      const parsed = (0, validation_1.parseValidatedRequest)(action_request_1.getActionByIdSchema, req);
      const allowedProjectIds = (0, tenant_scope_1.getTenantScopedProjectIds)(
        res,
        'GET /v1/actions/:actionId',
        'actions',
      );
      const row = await services.action.getById({
        allowedProjectIds,
        actionId: parsed.params.actionId,
      });
      (0, responses_1.OkResponse)(
        res,
        (0, action_request_1.mapActionRequestRowToResponse)(row),
        action_request_1.createActionRequestResponseSchema,
      );
    },
  );
  router.patch(
    '/actions/:actionId',
    apiKeyAuthMiddleware,
    workflowInteractionTenantMiddleware,
    (0, validation_1.createRequestSchemaValidator)(action_request_1.patchActionStatusByIdSchema),
    async (req, res) => {
      const parsed = (0, validation_1.parseValidatedRequest)(action_request_1.patchActionStatusByIdSchema, req);
      const allowedProjectIds = (0, tenant_scope_1.getTenantScopedProjectIds)(
        res,
        'PATCH /v1/actions/:actionId',
        'actions',
      );
      // WIL API is trusted — bypass state machine validation via directUpdate.
      const setValues = (0, patch_action_set_values_1.buildPatchSetValues)(parsed.body);
      const row = await services.action.directUpdate({
        allowedProjectIds,
        actionId: parsed.params.actionId,
        setValues,
      });
      (0, responses_1.OkResponse)(
        res,
        (0, action_request_1.mapActionRequestRowToResponse)(row),
        action_request_1.createActionRequestResponseSchema,
      );
    },
  );
  return router;
}
