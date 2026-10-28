import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectRateLimitService, RateLimitExceededError } from '../../../src/api/services/project-rate-limit.service';
import { AppError } from '../../../src/api/utils/errors';
import { getCurrentPeriodKeys } from '../../../src/api/helpers/period';
import type { ProjectRateLimit } from '../../../src/db/schema/project-rate-limit';
import {
  VALID_PROJECT_ID,
  VALID_WORKFLOW_ID,
  createMockN8nRepositories,
  createMockProjectExecutionUsageRepository,
  createMockProjectRateLimitRepository,
} from '../../helpers/mocks';

/** Captures the rejection reason; fails the test when the promise resolves. */
async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('Expected the call to reject');
    },
    (error: unknown) => error,
  );
}

function makeConfigRow(overrides: Partial<ProjectRateLimit> = {}): ProjectRateLimit {
  return {
    projectId: VALID_PROJECT_ID,
    weeklyRateLimit: null,
    yearlyRateLimit: null,
    lastAdminComment: null,
    stopBehavior: 'hard_stop',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('ProjectRateLimitService', () => {
  let n8nRepos: ReturnType<typeof createMockN8nRepositories>;
  let rateLimitRepo: ReturnType<typeof createMockProjectRateLimitRepository>;
  let usageRepo: ReturnType<typeof createMockProjectExecutionUsageRepository>;
  let service: ProjectRateLimitService;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let periodKeys: { weekly: string; yearly: string };

  beforeEach(() => {
    n8nRepos = createMockN8nRepositories();
    rateLimitRepo = createMockProjectRateLimitRepository();
    usageRepo = createMockProjectExecutionUsageRepository();
    service = new ProjectRateLimitService(
      n8nRepos as any,
      {
        projectRateLimit: rateLimitRepo,
        projectExecutionUsage: usageRepo,
      } as any,
    );
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    periodKeys = getCurrentPeriodKeys();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('enforceExecution', () => {
    describe('exempt modes', () => {
      it.each(['manual', 'internal', 'evaluation', 'eval_manual'])(
        'allows %s runs without any repository access',
        async (mode) => {
          await expect(
            service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode, countUsage: true }),
          ).resolves.toBeUndefined();

          expect(n8nRepos.sharedWorkflow.findProjectIds).not.toHaveBeenCalled();
          expect(rateLimitRepo.get).not.toHaveBeenCalled();
          expect(usageRepo.getCounts).not.toHaveBeenCalled();
          expect(usageRepo.increment).not.toHaveBeenCalled();
          expect(n8nRepos.sharedWorkflow.countByProjectIds).not.toHaveBeenCalled();
        },
      );
    });

    it('allows orphan workflows without counting usage', async () => {
      n8nRepos.sharedWorkflow.findProjectIds.mockResolvedValue([]);

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();

      expect(n8nRepos.sharedWorkflow.findProjectIds).toHaveBeenCalledWith(VALID_WORKFLOW_ID);
      expect(rateLimitRepo.get).not.toHaveBeenCalled();
      expect(usageRepo.getCounts).not.toHaveBeenCalled();
      expect(usageRepo.increment).not.toHaveBeenCalled();
    });

    it('rate limits against the first project when a workflow is shared with several', async () => {
      n8nRepos.sharedWorkflow.findProjectIds.mockResolvedValue(['proj-001', 'proj-999']);
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });

      const error = (await captureRejection(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      )) as RateLimitExceededError;

      expect(error).toBeInstanceOf(RateLimitExceededError);
      expect(rateLimitRepo.get).toHaveBeenCalledTimes(1);
      expect(rateLimitRepo.get).toHaveBeenCalledWith('proj-001');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('multiple projects'));
    });

    it('allows unconfigured projects and counts both periods', async () => {
      rateLimitRepo.get.mockResolvedValue(null);

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();

      expect(usageRepo.getCounts).toHaveBeenCalledWith(VALID_PROJECT_ID, periodKeys.weekly, periodKeys.yearly);
      expect(usageRepo.increment).toHaveBeenCalledTimes(2);
      expect(usageRepo.increment).toHaveBeenNthCalledWith(1, VALID_PROJECT_ID, 'weekly', periodKeys.weekly);
      expect(usageRepo.increment).toHaveBeenNthCalledWith(2, VALID_PROJECT_ID, 'yearly', periodKeys.yearly);
    });

    it('allows executions under the configured limits and counts both periods', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 100, yearlyRateLimit: 1000 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 5, yearlyCount: 50 });

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'webhook', countUsage: true }),
      ).resolves.toBeUndefined();

      expect(usageRepo.increment).toHaveBeenCalledTimes(2);
      expect(usageRepo.increment).toHaveBeenNthCalledWith(1, VALID_PROJECT_ID, 'weekly', periodKeys.weekly);
      expect(usageRepo.increment).toHaveBeenNthCalledWith(2, VALID_PROJECT_ID, 'yearly', periodKeys.yearly);
    });

    it('rejects with RateLimitExceededError when the weekly limit is reached (hard stop, no increments)', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10, yearlyRateLimit: 1000 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 50 });

      const error = (await captureRejection(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      )) as RateLimitExceededError;

      expect(error).toBeInstanceOf(RateLimitExceededError);
      expect(error.message).toContain(VALID_PROJECT_ID);
      expect(error.message).toContain('Weekly');
      expect(error.message).toContain('limit 10');
      expect(error.message).toContain('used 10');
      expect(error.message).toContain(periodKeys.weekly);
      expect(usageRepo.increment).not.toHaveBeenCalled();
    });

    it('rejects with RateLimitExceededError when the yearly limit is exceeded (hard stop, no increments)', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 100, yearlyRateLimit: 100 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 5, yearlyCount: 150 });

      const error = (await captureRejection(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      )) as RateLimitExceededError;

      expect(error).toBeInstanceOf(RateLimitExceededError);
      expect(error.message).toContain(VALID_PROJECT_ID);
      expect(error.message).toContain('Yearly');
      expect(error.message).toContain('limit 100');
      expect(error.message).toContain('used 150');
      expect(error.message).toContain(periodKeys.yearly);
      expect(usageRepo.increment).not.toHaveBeenCalled();
    });

    it('allows over-limit executions with soft stop, counting usage and warning', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10, stopBehavior: 'soft_stop' }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 12, yearlyCount: 0 });

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Soft stop configured — execution continues'));
      expect(usageRepo.increment).toHaveBeenCalledTimes(2);
      expect(usageRepo.increment).toHaveBeenNthCalledWith(1, VALID_PROJECT_ID, 'weekly', periodKeys.weekly);
      expect(usageRepo.increment).toHaveBeenNthCalledWith(2, VALID_PROJECT_ID, 'yearly', periodKeys.yearly);
    });

    it('rejects over-limit executions without counting when countUsage is false (check-only)', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 12, yearlyCount: 0 });

      const error = (await captureRejection(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: false }),
      )) as RateLimitExceededError;

      expect(error).toBeInstanceOf(RateLimitExceededError);
      expect(usageRepo.increment).not.toHaveBeenCalled();
    });

    it('allows under-limit executions without counting when countUsage is false', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 100, yearlyRateLimit: 1000 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 5, yearlyCount: 50 });

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: false }),
      ).resolves.toBeUndefined();

      expect(usageRepo.increment).not.toHaveBeenCalled();
    });

    it('fails open when the config repository rejects', async () => {
      rateLimitRepo.get.mockRejectedValue(new Error('custom DB unreachable'));

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failing open'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(VALID_WORKFLOW_ID));
      expect(usageRepo.increment).not.toHaveBeenCalled();
    });
  });

  describe('updateRateLimit', () => {
    const body = {
      weeklyRateLimit: 10,
      yearlyRateLimit: 1000,
      lastAdminComment: 'Cap for FY',
      stopBehavior: 'hard_stop' as const,
    };

    it('throws AppError 404 for an unknown project', async () => {
      const error = (await captureRejection(service.updateRateLimit('unknown-project', body))) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Project not found');
      expect(rateLimitRepo.upsert).not.toHaveBeenCalled();
    });

    it('upserts the configuration for a known project and returns the stored row', async () => {
      const stored = makeConfigRow(body);
      rateLimitRepo.get.mockResolvedValue(stored);

      const result = await service.updateRateLimit(VALID_PROJECT_ID, body);

      expect(result).toBe(stored);
      expect(rateLimitRepo.upsert).toHaveBeenCalledWith({ projectId: VALID_PROJECT_ID, ...body });
      expect(rateLimitRepo.get).toHaveBeenCalledWith(VALID_PROJECT_ID);
    });
  });

  describe('enrichAdminProjects', () => {
    it('returns merged enrichment from one batched query per source', async () => {
      const configRow = makeConfigRow({
        weeklyRateLimit: 10,
        yearlyRateLimit: 1000,
        lastAdminComment: 'Cap for FY',
        stopBehavior: 'soft_stop',
      });
      rateLimitRepo.listByProjectIds.mockResolvedValue(new Map([[VALID_PROJECT_ID, configRow]]));
      usageRepo.listCountsByProjectIds.mockResolvedValue(
        new Map([[VALID_PROJECT_ID, { weeklyCount: 3, yearlyCount: 30 }]]),
      );
      n8nRepos.sharedWorkflow.countByProjectIds.mockResolvedValue(new Map([[VALID_PROJECT_ID, 5]]));

      const result = await service.enrichAdminProjects([{ projectId: 'proj-001' }, { projectId: 'proj-002' }]);

      expect(rateLimitRepo.listByProjectIds).toHaveBeenCalledTimes(1);
      expect(rateLimitRepo.listByProjectIds).toHaveBeenCalledWith(['proj-001', 'proj-002']);
      expect(usageRepo.listCountsByProjectIds).toHaveBeenCalledTimes(1);
      expect(usageRepo.listCountsByProjectIds).toHaveBeenCalledWith(
        ['proj-001', 'proj-002'],
        periodKeys.weekly,
        periodKeys.yearly,
      );
      expect(n8nRepos.sharedWorkflow.countByProjectIds).toHaveBeenCalledTimes(1);
      expect(n8nRepos.sharedWorkflow.countByProjectIds).toHaveBeenCalledWith(['proj-001', 'proj-002']);
      expect(result['proj-001']).toEqual({
        weeklyRateLimit: 10,
        yearlyRateLimit: 1000,
        stopBehavior: 'soft_stop',
        lastAdminComment: 'Cap for FY',
        weeklyExecutionCount: 3,
        yearlyExecutionCount: 30,
        workflowCount: 5,
      });
      expect(result['proj-002']).toEqual({
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        stopBehavior: null,
        lastAdminComment: null,
        weeklyExecutionCount: 0,
        yearlyExecutionCount: 0,
        workflowCount: 0,
      });
    });

    it('returns default enrichment when a source throws so the admin list keeps working', async () => {
      rateLimitRepo.listByProjectIds.mockRejectedValue(new Error('custom DB outage'));

      const result = await service.enrichAdminProjects([{ projectId: 'proj-001' }, { projectId: 'proj-002' }]);

      expect(result['proj-001']).toEqual({
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        stopBehavior: null,
        lastAdminComment: null,
        weeklyExecutionCount: 0,
        yearlyExecutionCount: 0,
        workflowCount: 0,
      });
      expect(result['proj-002']).toEqual({
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        stopBehavior: null,
        lastAdminComment: null,
        weeklyExecutionCount: 0,
        yearlyExecutionCount: 0,
        workflowCount: 0,
      });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('rate-limit data'));
    });

    it('returns an empty record without querying when there are no items', async () => {
      const result = await service.enrichAdminProjects([]);

      expect(result).toEqual({});
      expect(rateLimitRepo.listByProjectIds).not.toHaveBeenCalled();
      expect(usageRepo.listCountsByProjectIds).not.toHaveBeenCalled();
      expect(n8nRepos.sharedWorkflow.countByProjectIds).not.toHaveBeenCalled();
    });
  });
});
