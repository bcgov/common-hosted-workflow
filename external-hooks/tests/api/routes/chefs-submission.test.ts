/**
 * Unit tests for POST /chefs/submissions/callback and /submissions/register route handlers.
 *
 * Strategy: build the router with a mocked chefsSubmissionWebhook repository,
 * mock global fetch for the upstream webhook call, and verify each
 * behavioral path (db-row lookup, header fallback, query param forwarding,
 * row deletion on 2xx, no deletion on non-2xx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/config')>();
  // Expose INTERNAL_AUTH_TOKEN as a mutable field so the internal-bearer
  // middleware (which reads it at request time) can be tested for both
  // the auth-pass and auth-fail paths without touching process.env.
  return { ...original, N8N_BASE_URL: 'https://n8n.test', INTERNAL_AUTH_TOKEN: '' };
});

import * as config from '@config';
import { createInternalBearerMiddleware } from '../../../src/api/middlewares/internal-bearer';
import { buildChefsSubmissionRouter } from '../../../src/api/routes/chefs-submission';
import { createMockRequest, createMockResponse } from '../../helpers/mocks';
import { getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';
import { AppError } from '../../../src/api/utils/errors';

const FORM_ID = 'form-1';
const SUBMISSION_ID = 'sub-1';
const DB_WEBHOOK_URL = 'https://n8n.test/db-hook';
const N8N_BASE_URL = 'https://n8n.test';
const HEADER_WEBHOOK_PATH = '/header-hook';
const HEADER_WEBHOOK_URL = `${N8N_BASE_URL}/webhook/header-hook`;

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

  const routeContext = {
    customRepositories: { chefsSubmissionWebhook },
    // Callback route tests don't exercise auth; stub a passthrough.
    internalBearerMiddleware: (_req: any, _res: any, next: any) => next(),
  } as any;

  const router = buildChefsSubmissionRouter(routeContext);
  return { router, chefsSubmissionWebhook };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(config).INTERNAL_AUTH_TOKEN = '';
});

describe('POST /chefs/submissions/callback', () => {
  it('uses the db webhook url and deletes the row on 2xx', async () => {
    const { router, chefsSubmissionWebhook } = createTestRouter({
      getPendingByFormAndSubmission: vi.fn().mockResolvedValue(makePendingRow()),
    });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/submissions/callback')!;
    const req = createMockRequest({
      body: { formId: FORM_ID, submissionId: SUBMISSION_ID, extra: 'data' },
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, req, res);

    expect(error).toBeNull();
    expect(chefsSubmissionWebhook.getPendingByFormAndSubmission).toHaveBeenCalledWith({
      formId: FORM_ID,
      submissionId: SUBMISSION_ID,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      DB_WEBHOOK_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ formId: FORM_ID, submissionId: SUBMISSION_ID, extra: 'data' }),
      }),
    );
    expect(chefsSubmissionWebhook.deleteRow).toHaveBeenCalledWith({
      formId: FORM_ID,
      submissionId: SUBMISSION_ID,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('falls back to x-n8n-webhook-path header when no pending db row', async () => {
    const { router, chefsSubmissionWebhook } = createTestRouter();
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/submissions/callback')!;
    const req = createMockRequest({
      body: { formId: FORM_ID, submissionId: SUBMISSION_ID },
      headers: { 'x-n8n-webhook-path': HEADER_WEBHOOK_PATH },
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, req, res);

    expect(error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(HEADER_WEBHOOK_URL, expect.objectContaining({ method: 'POST' }));
    expect(chefsSubmissionWebhook.deleteRow).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards incoming query params to the upstream url', async () => {
    const { router } = createTestRouter({
      getPendingByFormAndSubmission: vi.fn().mockResolvedValue(makePendingRow()),
    });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/submissions/callback')!;
    const req = createMockRequest({
      body: { formId: FORM_ID, submissionId: SUBMISSION_ID },
      url: '/submissions/callback?tenant=abc&topic=xyz',
      query: { tenant: 'abc', topic: 'xyz' },
    });
    const res = createMockResponse();

    await runHandlerChain(handlers, req, res);

    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain('tenant=abc');
    expect(calledUrl).toContain('topic=xyz');
    expect(calledUrl.startsWith(DB_WEBHOOK_URL)).toBe(true);
  });

  it('does not delete the row when upstream returns non-2xx', async () => {
    const { router, chefsSubmissionWebhook } = createTestRouter({
      getPendingByFormAndSubmission: vi.fn().mockResolvedValue(makePendingRow()),
    });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('Service Unavailable'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/submissions/callback')!;
    const req = createMockRequest({ body: { formId: FORM_ID, submissionId: SUBMISSION_ID } });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, req, res);

    expect(error).toBeNull();
    expect(chefsSubmissionWebhook.deleteRow).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Service Unavailable' } });
  });

  it('throws AppError 400 when no db row and no header webhook path', async () => {
    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/submissions/callback')!;
    const req = createMockRequest({ body: { formId: FORM_ID, submissionId: SUBMISSION_ID } });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
  });

  it('throws 504 AppError on upstream timeout', async () => {
    const { router, chefsSubmissionWebhook } = createTestRouter({
      getPendingByFormAndSubmission: vi.fn().mockResolvedValue(makePendingRow()),
    });
    const timeoutError = new Error('aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));

    const handlers = getRouteHandlers(router, 'post', '/submissions/callback')!;
    const req = createMockRequest({ body: { formId: FORM_ID, submissionId: SUBMISSION_ID } });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, req, res);

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
      customRepositories: { chefsSubmissionWebhook },
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
      body: {
        executionId: EXECUTION_ID,
        formId: FORM_ID,
        submissionId: SUBMISSION_ID,
        resumeUrl: RESUME_URL,
      },
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
      body: {
        executionId: EXECUTION_ID,
        formId: FORM_ID,
        submissionId: SUBMISSION_ID,
        resumeUrl: RESUME_URL,
      },
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
      body: {
        executionId: EXECUTION_ID,
        formId: FORM_ID,
        submissionId: SUBMISSION_ID,
        resumeUrl: 'not-a-url',
      },
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
  });
});
