'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const chefs_submission_webhook_1 = require('../../../../src/db/repository/custom/chefs-submission-webhook');
(0, vitest_1.describe)('ChefsSubmissionWebhookRepository', () => {
  let db;
  let repo;
  (0, vitest_1.beforeEach)(() => {
    db = {
      select: vitest_1.vi.fn().mockReturnThis(),
      delete: vitest_1.vi.fn().mockReturnThis(),
      from: vitest_1.vi.fn().mockReturnThis(),
      where: vitest_1.vi.fn().mockReturnThis(),
      limit: vitest_1.vi.fn().mockReturnThis(),
      returning: vitest_1.vi.fn().mockResolvedValue([]),
    };
    repo = new chefs_submission_webhook_1.ChefsSubmissionWebhookRepository(db);
  });
  (0, vitest_1.describe)('getPendingByFormAndSubmission', () => {
    (0, vitest_1.it)('returns the pending row when found', async () => {
      const mockRow = {
        executionId: 'exec-1',
        webhookUrl: 'https://n8n.test/hook',
        formId: 'form-1',
        submissionId: 'sub-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.limit.mockResolvedValue([mockRow]);
      const result = await repo.getPendingByFormAndSubmission({ formId: 'form-1', submissionId: 'sub-1' });
      (0, vitest_1.expect)(db.select).toHaveBeenCalled();
      (0, vitest_1.expect)(db.from).toHaveBeenCalled();
      (0, vitest_1.expect)(db.where).toHaveBeenCalled();
      (0, vitest_1.expect)(db.limit).toHaveBeenCalledWith(1);
      (0, vitest_1.expect)(result).toEqual(mockRow);
    });
    (0, vitest_1.it)('returns null when no pending row exists', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.getPendingByFormAndSubmission({ formId: 'form-1', submissionId: 'sub-1' });
      (0, vitest_1.expect)(result).toBeNull();
    });
  });
  (0, vitest_1.describe)('deleteRow', () => {
    (0, vitest_1.it)('deletes the row and returns it', async () => {
      const deleted = {
        executionId: 'exec-1',
        webhookUrl: 'https://n8n.test/hook',
        formId: 'form-1',
        submissionId: 'sub-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.returning.mockResolvedValue([deleted]);
      const result = await repo.deleteRow({ formId: 'form-1', submissionId: 'sub-1' });
      (0, vitest_1.expect)(db.delete).toHaveBeenCalled();
      (0, vitest_1.expect)(db.where).toHaveBeenCalled();
      (0, vitest_1.expect)(db.returning).toHaveBeenCalled();
      (0, vitest_1.expect)(result).toEqual(deleted);
    });
    (0, vitest_1.it)('returns null when no matching row exists', async () => {
      db.returning.mockResolvedValue([]);
      const result = await repo.deleteRow({ formId: 'form-1', submissionId: 'sub-1' });
      (0, vitest_1.expect)(result).toBeNull();
    });
  });
});
