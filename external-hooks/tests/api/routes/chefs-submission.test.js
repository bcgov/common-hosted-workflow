"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit tests for POST /chefs/:webhookPath and /submissions/register route handlers.
 *
 * The callback route is a pass-through forwarder: `ChefsSubmissionService` decides ignore /
 * fresh / resubmission, and the route forwards the request (body + query + headers, including the
 * caller's auth header) to the n8n Webhook node, which authenticates via its Header Auth credential.
 * The route is wired with a real `ChefsSubmissionService` backed by a mocked repository.
 */
const vitest_1 = require("vitest");
vitest_1.vi.mock('@config', async (importOriginal) => {
    const original = await importOriginal();
    return { ...original, N8N_BASE_URL: 'https://n8n.test', INTERNAL_AUTH_TOKEN: 'internal-secret' };
});
const config = __importStar(require("@config"));
const internal_bearer_1 = require("../../../src/api/middlewares/internal-bearer");
const chefs_submission_1 = require("../../../src/api/routes/chefs-submission");
const chefs_submission_service_1 = require("../../../src/api/services/chefs-submission.service");
const mocks_1 = require("../../helpers/mocks");
const test_utils_1 = require("../../helpers/test-utils");
const errors_1 = require("../../../src/api/utils/errors");
const FORM_ID = 'form-1';
const SUBMISSION_ID = 'sub-1';
const DB_WEBHOOK_URL = 'https://n8n.test/db-hook';
const N8N_BASE_URL = 'https://n8n.test';
const WEBHOOK_PATH = 'waste-management';
const PATH_WEBHOOK_URL = `${N8N_BASE_URL}/webhook/${WEBHOOK_PATH}`;
const CHEF_KEY_HEADER = 'x-n8n-chef-key';
const CHEF_KEY_VALUE = 'secret-key-123'; // pragma: allowlist secret
function makePendingRow(overrides = {}) {
    return {
        executionId: 'exec-1',
        webhookUrl: DB_WEBHOOK_URL,
        formId: FORM_ID,
        submissionId: SUBMISSION_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}
function createTestRouter(repoOverrides = {}) {
    const chefsSubmissionWebhook = {
        getPendingByFormAndSubmission: vitest_1.vi.fn().mockResolvedValue(null),
        deleteRow: vitest_1.vi.fn().mockResolvedValue(null),
        upsertPending: vitest_1.vi.fn().mockResolvedValue(null),
        ...repoOverrides,
    };
    const customRepositories = { chefsSubmissionWebhook };
    const routeContext = {
        services: { chefsSubmission: new chefs_submission_service_1.ChefsSubmissionService(customRepositories) },
        internalBearerMiddleware: (_req, _res, next) => next(),
    };
    const router = (0, chefs_submission_1.buildChefsSubmissionRouter)(routeContext);
    return { router, chefsSubmissionWebhook };
}
function callbackRequest(overrides = {}) {
    return (0, mocks_1.createMockRequest)({
        params: { webhookPath: WEBHOOK_PATH },
        body: { subscriptionEvent: 'eventSubmission', formId: FORM_ID, submissionId: SUBMISSION_ID },
        headers: { host: 'external-hooks.test', 'content-length': '42', [CHEF_KEY_HEADER]: CHEF_KEY_VALUE },
        ...overrides,
    });
}
(0, vitest_1.afterEach)(() => {
    vitest_1.vi.restoreAllMocks();
    vitest_1.vi.unstubAllGlobals();
    vitest_1.vi.mocked(config).INTERNAL_AUTH_TOKEN = 'internal-secret';
});
(0, vitest_1.describe)('POST /chefs/:webhookPath', () => {
    (0, vitest_1.it)('fresh submission: forwards to the path-derived webhook url with a single content-type and the auth header', async () => {
        const { router, chefsSubmissionWebhook } = createTestRouter();
        const mockFetch = vitest_1.vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vitest_1.vi.stubGlobal('fetch', mockFetch);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/:webhookPath');
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, callbackRequest(), res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(mockFetch).toHaveBeenCalledWith(PATH_WEBHOOK_URL, vitest_1.expect.objectContaining({ method: 'POST' }));
        const opts = mockFetch.mock.calls[0][1];
        // Auth header forwarded; host/content-length dropped. The incoming lowercase `content-type` is
        // NOT forwarded; callWebhook sets the single canonical `Content-Type` (capitalized).
        (0, vitest_1.expect)(opts.headers[CHEF_KEY_HEADER]).toBe(CHEF_KEY_VALUE);
        (0, vitest_1.expect)(opts.headers.host).toBeUndefined();
        (0, vitest_1.expect)(opts.headers['content-length']).toBeUndefined();
        const contentTypeKeys = Object.keys(opts.headers).filter((k) => k.toLowerCase() === 'content-type');
        (0, vitest_1.expect)(contentTypeKeys).toHaveLength(1);
        (0, vitest_1.expect)(opts.headers[contentTypeKeys[0]]).toBe('application/json');
        // Full body forwarded.
        (0, vitest_1.expect)(JSON.parse(opts.body)).toMatchObject({
            subscriptionEvent: 'eventSubmission',
            formId: FORM_ID,
            submissionId: SUBMISSION_ID,
        });
        (0, vitest_1.expect)(chefsSubmissionWebhook.deleteRow).not.toHaveBeenCalled();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    });
    (0, vitest_1.it)('ignores non-submission events: 200 OK, no forward, no db lookup', async () => {
        const { router, chefsSubmissionWebhook } = createTestRouter();
        const mockFetch = vitest_1.vi.fn();
        vitest_1.vi.stubGlobal('fetch', mockFetch);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/:webhookPath');
        const res = (0, mocks_1.createMockResponse)();
        const req = callbackRequest({
            body: { subscriptionEvent: 'eventStatusChange', formId: FORM_ID, submissionId: SUBMISSION_ID },
        });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(mockFetch).not.toHaveBeenCalled();
        (0, vitest_1.expect)(chefsSubmissionWebhook.getPendingByFormAndSubmission).not.toHaveBeenCalled();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    });
    (0, vitest_1.it)('resubmission: forwards to the stored resume url and deletes the row on 2xx', async () => {
        const { router, chefsSubmissionWebhook } = createTestRouter({
            getPendingByFormAndSubmission: vitest_1.vi.fn().mockResolvedValue(makePendingRow()),
        });
        const mockFetch = vitest_1.vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vitest_1.vi.stubGlobal('fetch', mockFetch);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/:webhookPath');
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, callbackRequest(), res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(mockFetch).toHaveBeenCalledWith(DB_WEBHOOK_URL, vitest_1.expect.objectContaining({ method: 'POST' }));
        (0, vitest_1.expect)(chefsSubmissionWebhook.deleteRow).toHaveBeenCalledWith({ formId: FORM_ID, submissionId: SUBMISSION_ID });
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    });
    (0, vitest_1.it)('forwards incoming query params to the upstream url', async () => {
        const { router } = createTestRouter({
            getPendingByFormAndSubmission: vitest_1.vi.fn().mockResolvedValue(makePendingRow()),
        });
        const mockFetch = vitest_1.vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vitest_1.vi.stubGlobal('fetch', mockFetch);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/:webhookPath');
        const req = callbackRequest({ url: `/${WEBHOOK_PATH}?topic=xyz`, query: { topic: 'xyz' } });
        await (0, test_utils_1.runHandlerChain)(handlers, req, (0, mocks_1.createMockResponse)());
        const calledUrl = mockFetch.mock.calls[0][0];
        (0, vitest_1.expect)(calledUrl).toContain('topic=xyz');
        (0, vitest_1.expect)(calledUrl.startsWith(DB_WEBHOOK_URL)).toBe(true);
    });
    (0, vitest_1.it)('surfaces upstream 403 (wrong auth header) without deleting the row', async () => {
        const { router, chefsSubmissionWebhook } = createTestRouter({
            getPendingByFormAndSubmission: vitest_1.vi.fn().mockResolvedValue(makePendingRow()),
        });
        const mockFetch = vitest_1.vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: vitest_1.vi.fn().mockResolvedValue('Authorization data is wrong!'),
        });
        vitest_1.vi.stubGlobal('fetch', mockFetch);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/:webhookPath');
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, callbackRequest(), res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(chefsSubmissionWebhook.deleteRow).not.toHaveBeenCalled();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(403);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ error: { message: 'Authorization data is wrong!' } });
    });
    (0, vitest_1.it)('throws 504 AppError on upstream timeout', async () => {
        const { router, chefsSubmissionWebhook } = createTestRouter({
            getPendingByFormAndSubmission: vitest_1.vi.fn().mockResolvedValue(makePendingRow()),
        });
        const timeoutError = new Error('aborted due to timeout');
        timeoutError.name = 'TimeoutError';
        vitest_1.vi.stubGlobal('fetch', vitest_1.vi.fn().mockRejectedValue(timeoutError));
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/:webhookPath');
        const error = await (0, test_utils_1.runHandlerChain)(handlers, callbackRequest(), (0, mocks_1.createMockResponse)());
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(504);
        (0, vitest_1.expect)(chefsSubmissionWebhook.deleteRow).not.toHaveBeenCalled();
    });
});
(0, vitest_1.describe)('POST /chefs/submissions/register', () => {
    const EXECUTION_ID = 'exec-1';
    const RESUME_URL = 'https://n8n.test/webhook/resume';
    function createRegisterRouterWithRealAuth(internalToken) {
        const chefsSubmissionWebhook = {
            getPendingByFormAndSubmission: vitest_1.vi.fn().mockResolvedValue(null),
            deleteRow: vitest_1.vi.fn().mockResolvedValue(null),
            upsertPending: vitest_1.vi.fn().mockResolvedValue(null),
        };
        vitest_1.vi.mocked(config).INTERNAL_AUTH_TOKEN = internalToken;
        const internalBearerMiddleware = (0, internal_bearer_1.createInternalBearerMiddleware)();
        const routeContext = {
            services: { chefsSubmission: new chefs_submission_service_1.ChefsSubmissionService({ chefsSubmissionWebhook }) },
            internalBearerMiddleware,
        };
        const router = (0, chefs_submission_1.buildChefsSubmissionRouter)(routeContext);
        return { router, chefsSubmissionWebhook };
    }
    (0, vitest_1.it)('upserts a pending row when the body is valid and auth passes', async () => {
        const { router, chefsSubmissionWebhook } = createRegisterRouterWithRealAuth('secret-token');
        vitest_1.vi.stubGlobal('fetch', vitest_1.vi.fn());
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/submissions/register');
        const req = (0, mocks_1.createMockRequest)({
            headers: { authorization: 'Bearer secret-token' },
            body: { executionId: EXECUTION_ID, formId: FORM_ID, submissionId: SUBMISSION_ID, resumeUrl: RESUME_URL },
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(chefsSubmissionWebhook.upsertPending).toHaveBeenCalledWith({
            executionId: EXECUTION_ID,
            formId: FORM_ID,
            submissionId: SUBMISSION_ID,
            webhookUrl: RESUME_URL,
        });
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    });
    (0, vitest_1.it)('rejects with 401 when the internal bearer token is missing', async () => {
        const { router, chefsSubmissionWebhook } = createRegisterRouterWithRealAuth('secret-token');
        vitest_1.vi.stubGlobal('fetch', vitest_1.vi.fn());
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/submissions/register');
        const req = (0, mocks_1.createMockRequest)({
            headers: {},
            body: { executionId: EXECUTION_ID, formId: FORM_ID, submissionId: SUBMISSION_ID, resumeUrl: RESUME_URL },
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(401);
        (0, vitest_1.expect)(chefsSubmissionWebhook.upsertPending).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects with 400 when resumeUrl is not a valid URL', async () => {
        const { router } = createRegisterRouterWithRealAuth('secret-token');
        vitest_1.vi.stubGlobal('fetch', vitest_1.vi.fn());
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/submissions/register');
        const req = (0, mocks_1.createMockRequest)({
            headers: { authorization: 'Bearer secret-token' },
            body: { executionId: EXECUTION_ID, formId: FORM_ID, submissionId: SUBMISSION_ID, resumeUrl: 'not-a-url' },
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(400);
    });
});
