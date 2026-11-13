"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWilRouter = buildWilRouter;
const express_1 = require("express");
const wil_tenant_1 = require("./helpers/wil-tenant");
const wil_actor_1 = require("./helpers/wil-actor");
const wil_response_1 = require("./helpers/wil-response");
const list_query_1 = require("../helpers/list-query");
const validation_1 = require("../utils/validation");
const wil_1 = require("../schemas/wil");
const responses_1 = require("./responses");
const errors_1 = require("../utils/errors");
const triggers_1 = require("./triggers");
const webhook_fire_1 = require("./helpers/webhook-fire");
const constants_1 = require("./constants/constants");
const action_state_machine_1 = require("../services/action-state-machine");
function buildWilRouter(routeContext) {
    const { services, customRepositories } = routeContext;
    const router = (0, express_1.Router)();
    /**
     * GET /tenants — Returns available tenants for the logged-in user.
     * Fetches from CSTAR API using the user's OIDC token (forwarded from request),
     * plus the user's personal n8n project as a pseudo-tenant.
     * Falls back to personal project only if CSTAR is unreachable.
     */
    router.get('/tenants', async (req, res) => {
        const session = req.session;
        // Use server-side upstream credential from authenticated session, never the UI bearer
        const upstreamAccessToken = session.upstreamAccessToken;
        // CSTAR expects the IDP user GUID (e.g. idir_user_guid), not the Keycloak sub
        const ssoUserId = session.claims.idir_user_guid || session.claims.bceid_user_guid || session.subject;
        const tenants = await services.tenant.listTenantsForUser({
            ssoUserId,
            accessToken: upstreamAccessToken,
            n8nUserId: session.n8nUser?.id,
        });
        (0, responses_1.OkResponse)(res, { tenants });
    });
    router.get('/messages', (0, validation_1.createRequestParser)(wil_1.wilListQuerySchema), async (req, res) => {
        const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, customRepositories.tenantProjectRelation);
        const session = req.session;
        const actorMatchers = (0, wil_actor_1.resolveActorMatchers)(session, tenantId);
        const { limit, since } = req.parsed.query;
        const rows = await services.message.list({
            allowedProjectIds,
            actorMatchers,
            limit,
            since,
        });
        const { rows: items, hasMore } = (0, list_query_1.paginateOverfetchedRows)(rows, limit);
        (0, responses_1.OkResponse)(res, (0, wil_response_1.formatListResponse)(items, hasMore));
    });
    router.get('/actions/counts', async (req, res) => {
        const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, customRepositories.tenantProjectRelation);
        const session = req.session;
        const actorMatchers = (0, wil_actor_1.resolveActorMatchers)(session, tenantId);
        const counts = await services.action.countByStatus({
            allowedProjectIds,
            actorMatchers,
        });
        (0, responses_1.OkResponse)(res, { counts });
    });
    router.get('/actions', (0, validation_1.createRequestParser)(wil_1.wilListQuerySchema), async (req, res) => {
        const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, customRepositories.tenantProjectRelation);
        const session = req.session;
        const actorMatchers = (0, wil_actor_1.resolveActorMatchers)(session, tenantId);
        const { limit, since, status } = req.parsed.query;
        const rows = await services.action.list({
            allowedProjectIds,
            actorMatchers,
            limit,
            since,
            status,
        });
        const { rows: items, hasMore } = (0, list_query_1.paginateOverfetchedRows)(rows, limit);
        const mapped = items.map(wil_response_1.mapActionToUiResponse);
        (0, responses_1.OkResponse)(res, (0, wil_response_1.formatListResponse)(mapped, hasMore));
    });
    router.post('/chefs-token', (0, validation_1.createRequestParser)(wil_1.wilChefsTokenSchema), async (req, res) => {
        const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, customRepositories.tenantProjectRelation);
        const session = req.session;
        const actorMatchers = (0, wil_actor_1.resolveActorMatchers)(session, tenantId);
        const { actionId } = req.parsed.body;
        const action = await services.action.getById({
            allowedProjectIds,
            actionId,
            actorMatchers,
        });
        if (action.actionType !== 'showform') {
            throw new errors_1.AppError(400, 'Invalid action type');
        }
        const payload = action.payload;
        const chefsCredentialId = payload.chefsCredentialId;
        const skipChefsSubmission = payload.skipChefsSubmission === true;
        const callbackFieldMappings = payload.callbackFieldMappings;
        const callbackMissingPathBehavior = payload.callbackMissingPathBehavior;
        // Prefer the n8n credential reference (secret resolved server-side, never in
        // execution data). Fall back to the legacy inline formId/formApiKey for actions
        // created before the credential-based flow.
        let formId;
        let formApiKey;
        let formName = payload.formName;
        let credentialBaseUrl;
        if (chefsCredentialId) {
            // A credential belongs to one project; only the action's own project may use it.
            const resolved = await services.chefs.resolveFormCredential({
                credentialId: chefsCredentialId,
                allowedProjectIds: [action.projectId],
            });
            formId = resolved.formId;
            formApiKey = resolved.formApiKey;
            formName = formName ?? resolved.formName;
            credentialBaseUrl = resolved.baseUrl;
        }
        else {
            formId = payload.formId;
            formApiKey = payload.formApiKey;
        }
        if (!formApiKey) {
            throw new errors_1.AppError(400, 'Missing formApiKey');
        }
        if (!formId) {
            throw new errors_1.AppError(400, 'Missing formId');
        }
        const tokenResult = await services.chefs.getFormToken({ formId, formApiKey, credentialBaseUrl });
        (0, responses_1.OkResponse)(res, {
            authToken: tokenResult.authToken,
            formId: tokenResult.formId,
            formName,
            baseUrl: tokenResult.baseUrl,
            ...(skipChefsSubmission && { skipChefsSubmission: true }),
            ...(skipChefsSubmission && Array.isArray(callbackFieldMappings) && { callbackFieldMappings }),
            ...(skipChefsSubmission && typeof callbackMissingPathBehavior === 'string' && { callbackMissingPathBehavior }),
        });
    });
    router.post('/callback', (0, validation_1.createRequestParser)(wil_1.wilCallbackSchema), async (req, res) => {
        const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, customRepositories.tenantProjectRelation);
        const session = req.session;
        const actorMatchers = (0, wil_actor_1.resolveActorMatchers)(session, tenantId);
        const { actionId, body } = req.parsed.body;
        const action = await services.action.getById({
            allowedProjectIds,
            actionId,
            actorMatchers,
        });
        // Claim gate: role/group actions require the claiming actor to complete
        if ((0, action_state_machine_1.isSharedActorType)(action.actorType) && action.claimedBy !== session.email) {
            throw new errors_1.AppError(403, 'Only the claiming actor can complete this action');
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
            (0, responses_1.OkResponse)(res, { success: true, message: 'Action completed' });
            return;
        }
        // Forward body to callbackUrl with 30s timeout
        const upstreamResponse = await (0, webhook_fire_1.callWebhook)({
            url: callbackUrl,
            method: callbackMethod,
            body: JSON.stringify(body),
            timeoutMs: constants_1.CALLBACK_TIMEOUT_MS,
            timeoutMessage: 'Upstream timeout',
            unreachableMessage: 'Upstream request failed',
        });
        // Non-2xx handling.
        if (!upstreamResponse.ok) {
            // "Gone" status codes (404/409/410) mean the callback target no longer
            // exists — e.g. an n8n execution-resume URL for an execution that has
            // already finished. The action can never be completed, so auto-cancel it
            // and tell the UI it is no longer valid. Detection is by status code only.
            if (constants_1.CALLBACK_CANCEL_STATUS_CODES.has(upstreamResponse.status)) {
                await services.action.updateStatus({
                    allowedProjectIds,
                    actionId,
                    actorMatchers,
                    status: action_state_machine_1.ACTION_STATUS_CANCELLED,
                    actorEmail: session.email,
                    currentAction: action,
                    cancellationReason: constants_1.ACTION_NO_LONGER_VALID_MESSAGE,
                });
                (0, responses_1.OkResponse)(res, { success: false, cancelled: true, message: constants_1.ACTION_NO_LONGER_VALID_MESSAGE });
                return;
            }
            // Any other non-2xx → surface the upstream error without changing status,
            // so the user can retry (the execution may still be waiting).
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
        (0, responses_1.OkResponse)(res, { success: true, message: 'Action completed' });
    });
    // POST /actions/:actionId/claim
    router.post('/actions/:actionId/claim', async (req, res) => {
        const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, customRepositories.tenantProjectRelation);
        const session = req.session;
        const actorMatchers = (0, wil_actor_1.resolveActorMatchers)(session, tenantId);
        const row = await services.claim.claim({
            actionId: req.params.actionId,
            actorEmail: session.email,
            actorMatchers,
            allowedProjectIds,
        });
        (0, responses_1.OkResponse)(res, (0, wil_response_1.mapActionToUiResponse)(row));
    });
    // POST /actions/:actionId/unclaim
    router.post('/actions/:actionId/unclaim', async (req, res) => {
        const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, customRepositories.tenantProjectRelation);
        const session = req.session;
        const actorMatchers = (0, wil_actor_1.resolveActorMatchers)(session, tenantId);
        const row = await services.claim.unclaim({
            actionId: req.params.actionId,
            actorEmail: session.email,
            actorMatchers,
            allowedProjectIds,
        });
        (0, responses_1.OkResponse)(res, (0, wil_response_1.mapActionToUiResponse)(row));
    });
    // GET /actions/:actionId/verify-claim — checks the action is still claimed by the calling user
    router.get('/actions/:actionId/verify-claim', async (req, res) => {
        const { tenantId, projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, customRepositories.tenantProjectRelation);
        const session = req.session;
        const actorMatchers = (0, wil_actor_1.resolveActorMatchers)(session, tenantId);
        const action = await services.action.getById({
            allowedProjectIds,
            actionId: req.params.actionId,
            actorMatchers,
        });
        const valid = action.claimedBy === session.email && (action.status === 'claimed' || action.status === 'in_progress');
        (0, responses_1.OkResponse)(res, { valid, status: action.status, claimedBy: action.claimedBy });
    });
    // POST /actions/:actionId/start
    router.post('/actions/:actionId/start', async (req, res) => {
        const { projectIds: allowedProjectIds } = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, customRepositories.tenantProjectRelation);
        const session = req.session;
        const row = await services.claim.start({
            actionId: req.params.actionId,
            actorEmail: session.email,
            allowedProjectIds,
        });
        (0, responses_1.OkResponse)(res, (0, wil_response_1.mapActionToUiResponse)(row));
    });
    router.use((0, triggers_1.buildTriggerRouter)(routeContext));
    return router;
}
