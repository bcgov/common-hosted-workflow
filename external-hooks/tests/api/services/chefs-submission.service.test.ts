/**
 * Unit tests for ChefsSubmissionService: the event gate, fresh-vs-resubmission resolution, and
 * post-delivery row cleanup.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/config')>();
  return { ...original, N8N_BASE_URL: 'https://n8n.test' };
});

import { ChefsSubmissionService } from '../../../src/api/services/chefs-submission.service';

const FORM_ID = 'form-1';
const SUBMISSION_ID = 'sub-1';
const WEBHOOK_PATH = 'waste-management';
const DB_URL = 'https://n8n.test/db-hook';

function makeService(pendingRow: unknown = null) {
  const chefsSubmissionWebhook = {
    getPendingByFormAndSubmission: vi.fn().mockResolvedValue(pendingRow),
    deleteRow: vi.fn().mockResolvedValue(null),
    upsertPending: vi.fn().mockResolvedValue(null),
  };
  const service = new ChefsSubmissionService({ chefsSubmissionWebhook } as any);
  return { service, chefsSubmissionWebhook };
}

afterEach(() => vi.restoreAllMocks());

describe('ChefsSubmissionService.resolveForward', () => {
  it('ignores non-submission events without touching the repository', async () => {
    const { service, chefsSubmissionWebhook } = makeService();

    const result = await service.resolveForward({
      webhookPath: WEBHOOK_PATH,
      subscriptionEvent: 'eventStatusChange',
      formId: FORM_ID,
      submissionId: SUBMISSION_ID,
    });

    expect(result).toEqual({ action: 'ignore' });
    expect(chefsSubmissionWebhook.getPendingByFormAndSubmission).not.toHaveBeenCalled();
  });

  it('fresh submission (no pending row): forwards to the path-derived webhook url', async () => {
    const { service } = makeService(null);

    const result = await service.resolveForward({
      webhookPath: WEBHOOK_PATH,
      subscriptionEvent: 'eventSubmission',
      formId: FORM_ID,
      submissionId: SUBMISSION_ID,
    });

    expect(result).toEqual({
      action: 'forward',
      outboundBaseUrl: `https://n8n.test/webhook/${WEBHOOK_PATH}`,
      usedDbRow: false,
    });
  });

  it('resubmission (pending row): forwards to the stored resume url', async () => {
    const { service } = makeService({ webhookUrl: DB_URL, formId: FORM_ID, submissionId: SUBMISSION_ID });

    const result = await service.resolveForward({
      webhookPath: WEBHOOK_PATH,
      subscriptionEvent: 'eventSubmission',
      formId: FORM_ID,
      submissionId: SUBMISSION_ID,
    });

    expect(result).toEqual({ action: 'forward', outboundBaseUrl: DB_URL, usedDbRow: true });
  });
});

describe('ChefsSubmissionService.confirmDelivered', () => {
  it('deletes the row when a db row was used', async () => {
    const { service, chefsSubmissionWebhook } = makeService();
    await service.confirmDelivered({ formId: FORM_ID, submissionId: SUBMISSION_ID, usedDbRow: true });
    expect(chefsSubmissionWebhook.deleteRow).toHaveBeenCalledWith({ formId: FORM_ID, submissionId: SUBMISSION_ID });
  });

  it('does not delete when a db row was not used (fresh submission)', async () => {
    const { service, chefsSubmissionWebhook } = makeService();
    await service.confirmDelivered({ formId: FORM_ID, submissionId: SUBMISSION_ID, usedDbRow: false });
    expect(chefsSubmissionWebhook.deleteRow).not.toHaveBeenCalled();
  });
});

describe('ChefsSubmissionService.register', () => {
  it('upserts a pending row', async () => {
    const { service, chefsSubmissionWebhook } = makeService();
    await service.register({ executionId: 'exec-1', formId: FORM_ID, submissionId: SUBMISSION_ID, resumeUrl: DB_URL });
    expect(chefsSubmissionWebhook.upsertPending).toHaveBeenCalledWith({
      executionId: 'exec-1',
      formId: FORM_ID,
      submissionId: SUBMISSION_ID,
      webhookUrl: DB_URL,
    });
  });
});
