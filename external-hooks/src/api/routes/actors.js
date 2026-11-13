"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildActorRouter = buildActorRouter;
const express_1 = require("express");
const list_query_1 = require("../helpers/list-query");
const responses_1 = require("./responses");
const tenant_scope_1 = require("./helpers/tenant-scope");
const patch_action_set_values_1 = require("./helpers/patch-action-set-values");
const action_request_1 = require("../schemas/action-request");
const message_1 = require("../schemas/message");
const validation_1 = require("../utils/validation");
function buildActorRouter({ apiKeyAuthMiddleware, workflowInteractionTenantMiddleware, services, }) {
    const router = (0, express_1.Router)();
    router.get('/actors/:actorId/messages', apiKeyAuthMiddleware, workflowInteractionTenantMiddleware, (0, validation_1.createRequestSchemaValidator)(message_1.listActorMessagesSchema), async (req, res) => {
        const parsed = (0, validation_1.parseValidatedRequest)(message_1.listActorMessagesSchema, req);
        const allowedProjectIds = (0, tenant_scope_1.getTenantScopedProjectIds)(res, 'GET /v1/actors/:actorId/messages', 'messages');
        const { workflowInstanceId } = parsed.query;
        const pageLimit = parsed.query.limit ?? 50;
        const rawRows = await services.message.list({
            allowedProjectIds,
            actorId: parsed.params.actorId,
            workflowInstanceId,
            limit: pageLimit,
            since: parsed.query.since,
        });
        // This endpoint doesn't paginate (no nextCursor in its response); trim the
        // repository's overfetched extra row so callers never see more than `limit` items.
        const { rows } = (0, list_query_1.paginateOverfetchedRows)(rawRows, pageLimit);
        (0, responses_1.OkResponse)(res, rows.map(message_1.mapMessageRowToResponse), message_1.listActorMessagesResponseSchema);
    });
    router.get('/actors/:actorId/actions/:actionId', apiKeyAuthMiddleware, workflowInteractionTenantMiddleware, (0, validation_1.createRequestSchemaValidator)(action_request_1.getActorActionByIdSchema), async (req, res) => {
        const parsed = (0, validation_1.parseValidatedRequest)(action_request_1.getActorActionByIdSchema, req);
        const allowedProjectIds = (0, tenant_scope_1.getTenantScopedProjectIds)(res, 'GET /v1/actors/:actorId/actions/:actionId', 'actions');
        const row = await services.action.getById({
            allowedProjectIds,
            actionId: parsed.params.actionId,
            actorId: parsed.params.actorId,
        });
        (0, responses_1.OkResponse)(res, (0, action_request_1.mapActionRequestRowToResponse)(row), action_request_1.createActionRequestResponseSchema);
    });
    router.get('/actors/:actorId/actions', apiKeyAuthMiddleware, workflowInteractionTenantMiddleware, (0, validation_1.createRequestSchemaValidator)(action_request_1.listActorActionsSchema), async (req, res) => {
        const parsed = (0, validation_1.parseValidatedRequest)(action_request_1.listActorActionsSchema, req);
        const allowedProjectIds = (0, tenant_scope_1.getTenantScopedProjectIds)(res, 'GET /v1/actors/:actorId/actions', 'actions');
        const { since, limit, workflowInstanceId } = parsed.query;
        const pageLimit = limit ?? 50;
        const rawRows = await services.action.list({
            allowedProjectIds,
            actorId: parsed.params.actorId,
            workflowInstanceId,
            limit: pageLimit,
            since,
        });
        const { rows, hasMore } = (0, list_query_1.paginateOverfetchedRows)(rawRows, pageLimit);
        const items = rows.map(action_request_1.mapActionRequestRowToResponse);
        const nextCursor = (0, list_query_1.nextCursorFromPagedItems)(items, hasMore);
        (0, responses_1.OkResponse)(res, { items, nextCursor }, action_request_1.listActionsResponseSchema);
    });
    router.patch('/actors/:actorId/actions/:actionId', apiKeyAuthMiddleware, workflowInteractionTenantMiddleware, (0, validation_1.createRequestSchemaValidator)(action_request_1.patchActorActionStatusSchema), async (req, res) => {
        const parsed = (0, validation_1.parseValidatedRequest)(action_request_1.patchActorActionStatusSchema, req);
        const allowedProjectIds = (0, tenant_scope_1.getTenantScopedProjectIds)(res, 'PATCH /v1/actors/:actorId/actions/:actionId', 'actions');
        // WIL API is trusted — bypass state machine validation via directUpdate.
        const setValues = (0, patch_action_set_values_1.buildPatchSetValues)(parsed.body);
        const row = await services.action.directUpdate({
            allowedProjectIds,
            actionId: parsed.params.actionId,
            actorId: parsed.params.actorId,
            setValues,
        });
        (0, responses_1.OkResponse)(res, (0, action_request_1.mapActionRequestRowToResponse)(row), action_request_1.createActionRequestResponseSchema);
    });
    return router;
}
