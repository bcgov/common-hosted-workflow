"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit tests for ChefsSubmissionService: the event gate, fresh-vs-resubmission resolution, and
 * post-delivery row cleanup.
 */
const vitest_1 = require("vitest");
vitest_1.vi.mock('@config', async (importOriginal) => {
    const original = await importOriginal();
    return { ...original, N8N_BASE_URL: 'https://n8n.test' };
});
const chefs_submission_service_1 = require("../../../src/api/services/chefs-submission.service");
const FORM_ID = 'form-1';
const SUBMISSION_ID = 'sub-1';
const WEBHOOK_PATH = 'waste-management';
const DB_URL = 'https://n8n.test/db-hook';
function makeService(pendingRow = null) {
    const chefsSubmissionWebhook = {
        getPendingByFormAndSubmission: vitest_1.vi.fn().mockResolvedValue(pendingRow),
        deleteRow: vitest_1.vi.fn().mockResolvedValue(null),
        upsertPending: vitest_1.vi.fn().mockResolvedValue(null),
    };
    const service = new chefs_submission_service_1.ChefsSubmissionService({ chefsSubmissionWebhook });
    return { service, chefsSubmissionWebhook };
}
(0, vitest_1.afterEach)(() => vitest_1.vi.restoreAllMocks());
(0, vitest_1.describe)('ChefsSubmissionService.resolveForward', () => {
    (0, vitest_1.it)('ignores non-submission events without touching the repository', async () => {
        const { service, chefsSubmissionWebhook } = makeService();
        const result = await service.resolveForward({
            webhookPath: WEBHOOK_PATH,
            subscriptionEvent: 'eventStatusChange',
            formId: FORM_ID,
            submissionId: SUBMISSION_ID,
        });
        (0, vitest_1.expect)(result).toEqual({ action: 'ignore' });
        (0, vitest_1.expect)(chefsSubmissionWebhook.getPendingByFormAndSubmission).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('fresh submission (no pending row): forwards to the path-derived webhook url', async () => {
        const { service } = makeService(null);
        const result = await service.resolveForward({
            webhookPath: WEBHOOK_PATH,
            subscriptionEvent: 'eventSubmission',
            formId: FORM_ID,
            submissionId: SUBMISSION_ID,
        });
        (0, vitest_1.expect)(result).toEqual({
            action: 'forward',
            outboundBaseUrl: `https://n8n.test/webhook/${WEBHOOK_PATH}`,
            usedDbRow: false,
        });
    });
    (0, vitest_1.it)('resubmission (pending row): forwards to the stored resume url', async () => {
        const { service } = makeService({ webhookUrl: DB_URL, formId: FORM_ID, submissionId: SUBMISSION_ID });
        const result = await service.resolveForward({
            webhookPath: WEBHOOK_PATH,
            subscriptionEvent: 'eventSubmission',
            formId: FORM_ID,
            submissionId: SUBMISSION_ID,
        });
        (0, vitest_1.expect)(result).toEqual({ action: 'forward', outboundBaseUrl: DB_URL, usedDbRow: true });
    });
});
(0, vitest_1.describe)('ChefsSubmissionService.confirmDelivered', () => {
    (0, vitest_1.it)('deletes the row when a db row was used', async () => {
        const { service, chefsSubmissionWebhook } = makeService();
        await service.confirmDelivered({ formId: FORM_ID, submissionId: SUBMISSION_ID, usedDbRow: true });
        (0, vitest_1.expect)(chefsSubmissionWebhook.deleteRow).toHaveBeenCalledWith({ formId: FORM_ID, submissionId: SUBMISSION_ID });
    });
    (0, vitest_1.it)('does not delete when a db row was not used (fresh submission)', async () => {
        const { service, chefsSubmissionWebhook } = makeService();
        await service.confirmDelivered({ formId: FORM_ID, submissionId: SUBMISSION_ID, usedDbRow: false });
        (0, vitest_1.expect)(chefsSubmissionWebhook.deleteRow).not.toHaveBeenCalled();
    });
});
(0, vitest_1.describe)('ChefsSubmissionService.register', () => {
    (0, vitest_1.it)('upserts a pending row', async () => {
        const { service, chefsSubmissionWebhook } = makeService();
        await service.register({ executionId: 'exec-1', formId: FORM_ID, submissionId: SUBMISSION_ID, resumeUrl: DB_URL });
        (0, vitest_1.expect)(chefsSubmissionWebhook.upsertPending).toHaveBeenCalledWith({
            executionId: 'exec-1',
            formId: FORM_ID,
            submissionId: SUBMISSION_ID,
            webhookUrl: DB_URL,
        });
    });
});
