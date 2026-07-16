import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChefsSubmissionWebhookRepository } from '../../../../src/db/repository/custom/chefs-submission-webhook';

describe('ChefsSubmissionWebhookRepository', () => {
  let db: any;
  let repo: ChefsSubmissionWebhookRepository;

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
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

  describe('deleteRow', () => {
    it('deletes the row and returns it', async () => {
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

      expect(db.delete).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalled();
      expect(db.returning).toHaveBeenCalled();
      expect(result).toEqual(deleted);
    });

    it('returns null when no matching row exists', async () => {
      db.returning.mockResolvedValue([]);

      const result = await repo.deleteRow({ formId: 'form-1', submissionId: 'sub-1' });

      expect(result).toBeNull();
    });
  });
});
