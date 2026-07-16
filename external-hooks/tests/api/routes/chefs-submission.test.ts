/**
 * Unit tests for POST /chefs/submissions/callback route handler.
 *
 * Strategy: build the router with a mocked chefsSubmissionWebhook repository,
 * mock global fetch for the upstream webhook call, and verify each
 * behavioral path (db-row lookup, header fallback, query param forwarding,
 * row deletion on 2xx, no deletion on non-2xx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/config')>();
  return { ...original, N8N_BASE_URL: 'https://n8n.test' };
});

import { buildChefsSubmissionRouter } from '../../../src/api/routes/chefs-submission';
import { createMockRequest, createMockResponse } from '../../helpers/mocks';
import { getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';
import { AppError } from '../../../src/api/utils/errors';

const FORM_ID = 'form-1';
const SUBMISSION_ID = 'sub-1';
const DB_WEBHOOK_URL = 'https://n8n.test/db-hook';
const N8N_BASE_URL = 'https://n8n.test';
const HEADER_WEBHOOK_PATH = '/webhook/header-hook';
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
    ...repoOverrides,
  };

  const routeContext = {
    customRepositories: { chefsSubmissionWebhook },
  } as any;

  const router = buildChefsSubmissionRouter(routeContext);
  return { router, chefsSubmissionWebhook };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
