import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChefsSubmissionWebhookRepository } from '../../../../src/db/repository/custom/chefs-submission-webhook';

describe('ChefsSubmissionWebhookRepository', () => {
  let db: any;
  let repo: ChefsSubmissionWebhookRepository;

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    repo = new ChefsSubmissionWebhookRepository(db);
  });

  describe('getPendingByFormAndSubmission', () => {
    it('returns the pending row when found', async () => {
      const mockRow = {
        executionId: 'exec-1',
        webhookUrl: 'https://n8n.test/hook',
        formId: 'form-1',
        submissionId: 'sub-1',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.limit.mockResolvedValue([mockRow]);

      const result = await repo.getPendingByFormAndSubmission({ formId: 'form-1', submissionId: 'sub-1' });

      expect(db.select).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalled();
      expect(db.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockRow);
    });

    it('returns null when no pending row exists', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.getPendingByFormAndSubmission({ formId: 'form-1', submissionId: 'sub-1' });

      expect(result).toBeNull();
    });
  });

  describe('markCompleted', () => {
    it('updates the pending row to completed and returns it', async () => {
      const updated = {
        executionId: 'exec-1',
        webhookUrl: 'https://n8n.test/hook',
        formId: 'form-1',
        submissionId: 'sub-1',
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.returning.mockResolvedValue([updated]);

      const result = await repo.markCompleted({ formId: 'form-1', submissionId: 'sub-1' });

      expect(db.update).toHaveBeenCalled();
      expect(db.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
      expect(db.where).toHaveBeenCalled();
      expect(db.returning).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('returns null when no pending row matches', async () => {
      db.returning.mockResolvedValue([]);

      const result = await repo.markCompleted({ formId: 'form-1', submissionId: 'sub-1' });

      expect(result).toBeNull();
    });
  });
});
