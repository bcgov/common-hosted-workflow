"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMessageRouter = buildMessageRouter;
const express_1 = require("express");
const list_query_1 = require("../helpers/list-query");
const responses_1 = require("./responses");
const tenant_scope_1 = require("./helpers/tenant-scope");
const message_1 = require("../schemas/message");
const validation_1 = require("../utils/validation");
function buildMessageRouter({ apiKeyAuthMiddleware, workflowInteractionTenantMiddleware, services, }) {
    const router = (0, express_1.Router)();
    router.get('/messages/', apiKeyAuthMiddleware, workflowInteractionTenantMiddleware, (0, validation_1.createRequestSchemaValidator)(message_1.listMessagesSchema), async (req, res) => {
        const parsed = (0, validation_1.parseValidatedRequest)(message_1.listMessagesSchema, req);
        const allowedProjectIds = (0, tenant_scope_1.getTenantScopedProjectIds)(res, 'GET /v1/messages/', 'messages');
        const { workflowInstanceId } = parsed.query;
        const pageLimit = parsed.query.limit ?? 50;
        const rawRows = await services.message.list({
            allowedProjectIds,
            actorId: parsed.query.actorId,
            workflowInstanceId,
            limit: pageLimit,
            since: parsed.query.since,
        });
        const { rows, hasMore } = (0, list_query_1.paginateOverfetchedRows)(rawRows, pageLimit);
        const items = rows.map(message_1.mapMessageRowToResponse);
        const nextCursor = (0, list_query_1.nextCursorFromPagedItems)(items, hasMore);
        (0, responses_1.OkResponse)(res, { items, nextCursor }, message_1.listMessagesResponseSchema);
    });
    router.post('/messages/', apiKeyAuthMiddleware, workflowInteractionTenantMiddleware, (0, validation_1.createRequestSchemaValidator)(message_1.createMessageSchema), async (req, res) => {
        const parsed = (0, validation_1.parseValidatedRequest)(message_1.createMessageSchema, req);
        const { title, body, actorId, actorType, workflowInstanceId, workflowId, metadata, status } = parsed.body;
        const allowedProjectIds = (0, tenant_scope_1.getTenantScopedProjectIds)(res, 'POST /v1/messages/', 'messages');
        const created = await services.message.create({
            allowedProjectIds,
            title,
            body,
            actorId,
            actorType,
            workflowInstanceId,
            workflowId,
            metadata,
            status,
        });
        (0, responses_1.CreatedResponse)(res, (0, message_1.mapMessageRowToResponse)(created), message_1.createMessageResponseSchema);
    });
    return router;
}
