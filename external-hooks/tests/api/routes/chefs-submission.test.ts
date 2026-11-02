/**
 * Unit tests for POST /chefs/:webhookPath and /submissions/register route handlers.
 *
 * The callback route is a pass-through forwarder: `ChefsSubmissionService` decides ignore /
 * fresh / resubmission, and the route forwards the request (body + query + headers, including the
 * caller's auth header) to the n8n Webhook node, which authenticates via its Header Auth credential.
 * The route is wired with a real `ChefsSubmissionService` backed by a mocked repository.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/config')>();
  return { ...original, N8N_BASE_URL: 'https://n8n.test', INTERNAL_AUTH_TOKEN: 'internal-secret' };
});

import * as config from '@config';
import { createInternalBearerMiddleware } from '../../../src/api/middlewares/internal-bearer';
import { buildChefsSubmissionRouter } from '../../../src/api/routes/chefs-submission';
import { ChefsSubmissionService } from '../../../src/api/services/chefs-submission.service';
import { createMockRequest, createMockResponse } from '../../helpers/mocks';
import { getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';
import { AppError } from '../../../src/api/utils/errors';

const FORM_ID = 'form-1';
const SUBMISSION_ID = 'sub-1';
const DB_WEBHOOK_URL = 'https://n8n.test/db-hook';
const N8N_BASE_URL = 'https://n8n.test';
const WEBHOOK_PATH = 'waste-management';
const PATH_WEBHOOK_URL = `${N8N_BASE_URL}/webhook/${WEBHOOK_PATH}`;
const CHEF_KEY_HEADER = 'x-n8n-chef-key';
const CHEF_KEY_VALUE = 'secret-key-123'; // pragma: allowlist secret

function makePendingRow(overrides: Record<string, unknown> = {}) {
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

function createTestRouter(repoOverrides: Record<string, any> = {}) {
  const chefsSubmissionWebhook = {
    getPendingByFormAndSubmission: vi.fn().mockResolvedValue(null),
    deleteRow: vi.fn().mockResolvedValue(null),
    upsertPending: vi.fn().mockResolvedValue(null),
    ...repoOverrides,
  };
  const customRepositories = { chefsSubmissionWebhook } as any;

  const routeContext = {
    services: { chefsSubmission: new ChefsSubmissionService(customRepositories) },
    internalBearerMiddleware: (_req: any, _res: any, next: any) => next(),
  } as any;

  const router = buildChefsSubmissionRouter(routeContext);
  return { router, chefsSubmissionWebhook };
}

function callbackRequest(overrides: Record<string, unknown> = {}) {
  return createMockRequest({
    params: { webhookPath: WEBHOOK_PATH },
    body: { subscriptionEvent: 'eventSubmission', formId: FORM_ID, submissionId: SUBMISSION_ID },
    headers: { host: 'external-hooks.test', 'content-length': '42', [CHEF_KEY_HEADER]: CHEF_KEY_VALUE },
    ...overrides,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(config).INTERNAL_AUTH_TOKEN = 'internal-secret';
});

describe('POST /chefs/:webhookPath', () => {
  it('fresh submission: forwards to the path-derived webhook url with a single content-type and the auth header', async () => {
    const { router, chefsSubmissionWebhook } = createTestRouter();
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/:webhookPath')!;
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, callbackRequest(), res);

    expect(error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(PATH_WEBHOOK_URL, expect.objectContaining({ method: 'POST' }));
    const opts = mockFetch.mock.calls[0][1] as { headers: Record<string, string>; body: string };
    // Auth header forwarded; host/content-length dropped. The incoming lowercase `content-type` is
    // NOT forwarded; callWebhook sets the single canonical `Content-Type` (capitalized).
    expect(opts.headers[CHEF_KEY_HEADER]).toBe(CHEF_KEY_VALUE);
    expect(opts.headers.host).toBeUndefined();
    expect(opts.headers['content-length']).toBeUndefined();
    const contentTypeKeys = Object.keys(opts.headers).filter((k) => k.toLowerCase() === 'content-type');
    expect(contentTypeKeys).toHaveLength(1);
    expect(opts.headers[contentTypeKeys[0]]).toBe('application/json');
    // Full body forwarded.
    expect(JSON.parse(opts.body)).toMatchObject({
      subscriptionEvent: 'eventSubmission',
      formId: FORM_ID,
      submissionId: SUBMISSION_ID,
    });
    expect(chefsSubmissionWebhook.deleteRow).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('ignores non-submission events: 200 OK, no forward, no db lookup', async () => {
    const { router, chefsSubmissionWebhook } = createTestRouter();
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/:webhookPath')!;
    const res = createMockResponse();
    const req = callbackRequest({
      body: { subscriptionEvent: 'eventStatusChange', formId: FORM_ID, submissionId: SUBMISSION_ID },
    });

    const error = await runHandlerChain(handlers, req, res);

    expect(error).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(chefsSubmissionWebhook.getPendingByFormAndSubmission).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('resubmission: forwards to the stored resume url and deletes the row on 2xx', async () => {
    const { router, chefsSubmissionWebhook } = createTestRouter({
      getPendingByFormAndSubmission: vi.fn().mockResolvedValue(makePendingRow()),
    });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/:webhookPath')!;
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, callbackRequest(), res);

    expect(error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(DB_WEBHOOK_URL, expect.objectContaining({ method: 'POST' }));
    expect(chefsSubmissionWebhook.deleteRow).toHaveBeenCalledWith({ formId: FORM_ID, submissionId: SUBMISSION_ID });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards incoming query params to the upstream url', async () => {
    const { router } = createTestRouter({
      getPendingByFormAndSubmission: vi.fn().mockResolvedValue(makePendingRow()),
    });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/:webhookPath')!;
    const req = callbackRequest({ url: `/${WEBHOOK_PATH}?topic=xyz`, query: { topic: 'xyz' } });

    await runHandlerChain(handlers, req, createMockResponse());

    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain('topic=xyz');
    expect(calledUrl.startsWith(DB_WEBHOOK_URL)).toBe(true);
  });

  it('surfaces upstream 403 (wrong auth header) without deleting the row', async () => {
    const { router, chefsSubmissionWebhook } = createTestRouter({
      getPendingByFormAndSubmission: vi.fn().mockResolvedValue(makePendingRow()),
    });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue('Authorization data is wrong!'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/:webhookPath')!;
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, callbackRequest(), res);

    expect(error).toBeNull();
    expect(chefsSubmissionWebhook.deleteRow).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Authorization data is wrong!' } });
  });

  it('throws 504 AppError on upstream timeout', async () => {
    const { router, chefsSubmissionWebhook } = createTestRouter({
      getPendingByFormAndSubmission: vi.fn().mockResolvedValue(makePendingRow()),
    });
    const timeoutError = new Error('aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));

    const handlers = getRouteHandlers(router, 'post', '/:webhookPath')!;
    const error = await runHandlerChain(handlers, callbackRequest(), createMockResponse());

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(504);
    expect(chefsSubmissionWebhook.deleteRow).not.toHaveBeenCalled();
  });
});

describe('POST /chefs/submissions/register', () => {
  const EXECUTION_ID = 'exec-1';
  const RESUME_URL = 'https://n8n.test/webhook/resume';

  function createRegisterRouterWithRealAuth(internalToken: string) {
    const chefsSubmissionWebhook = {
      getPendingByFormAndSubmission: vi.fn().mockResolvedValue(null),
      deleteRow: vi.fn().mockResolvedValue(null),
      upsertPending: vi.fn().mockResolvedValue(null),
    };
    vi.mocked(config).INTERNAL_AUTH_TOKEN = internalToken;
    const internalBearerMiddleware = createInternalBearerMiddleware();

    const routeContext = {
      services: { chefsSubmission: new ChefsSubmissionService({ chefsSubmissionWebhook } as any) },
      internalBearerMiddleware,
    } as any;
    const router = buildChefsSubmissionRouter(routeContext);
    return { router, chefsSubmissionWebhook };
  }

  it('upserts a pending row when the body is valid and auth passes', async () => {
    const { router, chefsSubmissionWebhook } = createRegisterRouterWithRealAuth('secret-token');
    vi.stubGlobal('fetch', vi.fn());

    const handlers = getRouteHandlers(router, 'post', '/submissions/register')!;
    const req = createMockRequest({
      headers: { authorization: 'Bearer secret-token' },
      body: { executionId: EXECUTION_ID, formId: FORM_ID, submissionId: SUBMISSION_ID, resumeUrl: RESUME_URL },
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, req, res);

    expect(error).toBeNull();
    expect(chefsSubmissionWebhook.upsertPending).toHaveBeenCalledWith({
      executionId: EXECUTION_ID,
      formId: FORM_ID,
      submissionId: SUBMISSION_ID,
      webhookUrl: RESUME_URL,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects with 401 when the internal bearer token is missing', async () => {
    const { router, chefsSubmissionWebhook } = createRegisterRouterWithRealAuth('secret-token');
    vi.stubGlobal('fetch', vi.fn());

    const handlers = getRouteHandlers(router, 'post', '/submissions/register')!;
    const req = createMockRequest({
      headers: {},
      body: { executionId: EXECUTION_ID, formId: FORM_ID, submissionId: SUBMISSION_ID, resumeUrl: RESUME_URL },
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
    expect(chefsSubmissionWebhook.upsertPending).not.toHaveBeenCalled();
  });

  it('rejects with 400 when resumeUrl is not a valid URL', async () => {
    const { router } = createRegisterRouterWithRealAuth('secret-token');
    vi.stubGlobal('fetch', vi.fn());

    const handlers = getRouteHandlers(router, 'post', '/submissions/register')!;
    const req = createMockRequest({
      headers: { authorization: 'Bearer secret-token' },
      body: { executionId: EXECUTION_ID, formId: FORM_ID, submissionId: SUBMISSION_ID, resumeUrl: 'not-a-url' },
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
  });
});
