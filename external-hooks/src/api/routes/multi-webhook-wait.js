"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMultiWebhookWaitRouter = buildMultiWebhookWaitRouter;
const express_1 = require("express");
const validation_1 = require("../utils/validation");
const multi_webhook_wait_1 = require("../schemas/multi-webhook-wait");
const responses_1 = require("./responses");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createLogger)('MultiWebhookWaitRoutes');
function buildMultiWebhookWaitRouter(routeContext) {
    const { services, internalBearerMiddleware } = routeContext;
    const router = (0, express_1.Router)();
    /**
     * POST /multi-webhook-wait/register
     *
     * Internal-only endpoint called by the MultiWebhookWait custom node before
     * an execution is put to wait. Registers the expected callbacks in the DB.
     *
     * Secured by internalBearerMiddleware (Authorization: Bearer <INTERNAL_AUTH_TOKEN>).
     */
    router.post('/register', internalBearerMiddleware, (0, validation_1.createRequestParser)(multi_webhook_wait_1.multiWebhookWaitRegisterSchema), async (req, res) => {
        const { executionId, resumeUrl, expectedCalls } = req.parsed.body;
        await services.multiWebhookWait.register({ executionId, resumeUrl, expectedCalls });
        (0, responses_1.OkResponse)(res, { success: true, message: 'Multi-webhook wait registered', executionId });
    });
    /**
     * POST /multi-webhook-wait/callback/:executionId
     *
     * Internal-only endpoint called by the MultiWebhookWait node's webhook() handler.
     * Marks an individual callback as received and returns the current completion status.
     *
     * The node's webhook handler uses this response to decide whether to resume
     * the workflow (all received) or keep waiting (partial).
     *
     * Request body: { matchKey: string, payload: unknown }
     */
    router.post('/callback/:executionId', internalBearerMiddleware, (0, validation_1.createRequestParser)(multi_webhook_wait_1.multiWebhookWaitCallbackSchema), async (req, res) => {
        const { executionId } = req.parsed.params;
        const { matchKey, payload } = req.body;
        log.debug('Marking callback as received', { executionId, matchKey });
        const result = await services.multiWebhookWait.markCallReceived({
            executionId,
            matchKey,
            payload,
        });
        if (result.allReceived) {
            // Cleanup DB state now that all calls are received
            log.debug('All callbacks received, cleaning up', { executionId });
            await services.multiWebhookWait.cleanup(executionId);
        }
        (0, responses_1.OkResponse)(res, {
            allReceived: result.allReceived,
            totalReceived: result.totalReceived,
            totalExpected: result.totalExpected,
            pending: result.pending,
            calls: result.allReceived ? await buildCallsMap(result.calls) : null,
        });
    });
    /**
     * GET /multi-webhook-wait/status/:executionId
     *
     * Internal-only endpoint to check the current progress of a multi-webhook wait.
     * Used by the node on timeout to retrieve partial results.
     */
    router.get('/status/:executionId', internalBearerMiddleware, (0, validation_1.createRequestParser)(multi_webhook_wait_1.multiWebhookWaitStatusSchema), async (req, res) => {
        const { executionId } = req.parsed.params;
        const status = await services.multiWebhookWait.getStatus(executionId);
        if (!status) {
            res.status(404).json({ error: { message: 'No pending multi-webhook wait found' } });
            return;
        }
        (0, responses_1.OkResponse)(res, status);
    });
    /**
     * DELETE /multi-webhook-wait/cleanup/:executionId
     *
     * Internal-only endpoint to clean up DB state after timeout resume.
     */
    router.delete('/cleanup/:executionId', internalBearerMiddleware, async (req, res) => {
        const executionId = req.params.executionId;
        await services.multiWebhookWait.cleanup(executionId);
        (0, responses_1.OkResponse)(res, { success: true, message: 'Cleaned up' });
    });
    return router;
}
/**
 * Builds a map of matchKey → payload from the completed call records.
 */
async function buildCallsMap(calls) {
    if (!calls)
        return {};
    const result = {};
    for (const call of calls) {
        result[call.matchKey] = call.payload;
    }
    return result;
}
