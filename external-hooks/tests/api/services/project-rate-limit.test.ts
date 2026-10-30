import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAX_TOPUP_HORIZON_WEEKS,
  ProjectRateLimitService,
  RateLimitExceededError,
} from '../../../src/api/services/project-rate-limit.service';
import { AppError } from '../../../src/api/utils/errors';
import {
  getCurrentPeriodKeys,
  getWeeklyPeriodKey,
  listUpcomingWeeklyPeriodKeys,
} from '../../../src/api/helpers/period';
import type { ProjectRateLimit } from '../../../src/db/schema/project-rate-limit';
import { UserRepository } from '../../../src/db/repository/n8n/user';
import {
  VALID_PROJECT_ID,
  VALID_TOPUP_ID,
  VALID_WORKFLOW_ID,
  createMockN8nRepositories,
  createMockProjectExecutionUsageRepository,
  createMockProjectRateLimitRepository,
  createMockProjectTopupRepository,
  createMockWorkflowExecutionUsageRepository,
  makeProjectTopupRow,
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
    updatedBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('ProjectRateLimitService', () => {
  let n8nRepos: ReturnType<typeof createMockN8nRepositories>;
  let rateLimitRepo: ReturnType<typeof createMockProjectRateLimitRepository>;
  let usageRepo: ReturnType<typeof createMockProjectExecutionUsageRepository>;
  let workflowUsageRepo: ReturnType<typeof createMockWorkflowExecutionUsageRepository>;
  let topupRepo: ReturnType<typeof createMockProjectTopupRepository>;
  let service: ProjectRateLimitService;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let periodKeys: { weekly: string; yearly: string };

  beforeEach(() => {
    n8nRepos = createMockN8nRepositories();
    rateLimitRepo = createMockProjectRateLimitRepository();
    usageRepo = createMockProjectExecutionUsageRepository();
    workflowUsageRepo = createMockWorkflowExecutionUsageRepository();
    topupRepo = createMockProjectTopupRepository();
    // The real user repository is wrapped around the raw mock so enrichment
    // exercises the metadata-driven display-name lookup.
    service = new ProjectRateLimitService(
      { ...n8nRepos, user: new UserRepository(n8nRepos.user as any) } as any,
      {
        projectRateLimit: rateLimitRepo,
        projectExecutionUsage: usageRepo,
        workflowExecutionUsage: workflowUsageRepo,
        projectTopup: topupRepo,
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
          expect(workflowUsageRepo.increment).not.toHaveBeenCalled();
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
      expect(workflowUsageRepo.increment).not.toHaveBeenCalled();
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
      expect(workflowUsageRepo.increment).toHaveBeenCalledTimes(2);
      expect(workflowUsageRepo.increment).toHaveBeenNthCalledWith(
        1,
        VALID_PROJECT_ID,
        VALID_WORKFLOW_ID,
        'weekly',
        periodKeys.weekly,
      );
      expect(workflowUsageRepo.increment).toHaveBeenNthCalledWith(
        2,
        VALID_PROJECT_ID,
        VALID_WORKFLOW_ID,
        'yearly',
        periodKeys.yearly,
      );
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
      expect(workflowUsageRepo.increment).toHaveBeenCalledTimes(2);
      expect(workflowUsageRepo.increment).toHaveBeenNthCalledWith(
        1,
        VALID_PROJECT_ID,
        VALID_WORKFLOW_ID,
        'weekly',
        periodKeys.weekly,
      );
      expect(workflowUsageRepo.increment).toHaveBeenNthCalledWith(
        2,
        VALID_PROJECT_ID,
        VALID_WORKFLOW_ID,
        'yearly',
        periodKeys.yearly,
      );
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
      expect(workflowUsageRepo.increment).not.toHaveBeenCalled();
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
      expect(workflowUsageRepo.increment).not.toHaveBeenCalled();
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
      expect(workflowUsageRepo.increment).toHaveBeenCalledTimes(2);
      expect(workflowUsageRepo.increment).toHaveBeenNthCalledWith(
        1,
        VALID_PROJECT_ID,
        VALID_WORKFLOW_ID,
        'weekly',
        periodKeys.weekly,
      );
      expect(workflowUsageRepo.increment).toHaveBeenNthCalledWith(
        2,
        VALID_PROJECT_ID,
        VALID_WORKFLOW_ID,
        'yearly',
        periodKeys.yearly,
      );
    });

    it('rejects over-limit executions without counting when countUsage is false (check-only)', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 12, yearlyCount: 0 });

      const error = (await captureRejection(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: false }),
      )) as RateLimitExceededError;

      expect(error).toBeInstanceOf(RateLimitExceededError);
      expect(usageRepo.increment).not.toHaveBeenCalled();
      expect(workflowUsageRepo.increment).not.toHaveBeenCalled();
    });

    it('allows under-limit executions without counting when countUsage is false', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 100, yearlyRateLimit: 1000 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 5, yearlyCount: 50 });

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: false }),
      ).resolves.toBeUndefined();

      expect(usageRepo.increment).not.toHaveBeenCalled();
      expect(workflowUsageRepo.increment).not.toHaveBeenCalled();
    });

    it('fails open when the config repository rejects', async () => {
      rateLimitRepo.get.mockRejectedValue(new Error('custom DB unreachable'));

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failing open'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(VALID_WORKFLOW_ID));
      expect(usageRepo.increment).not.toHaveBeenCalled();
      expect(workflowUsageRepo.increment).not.toHaveBeenCalled();
    });

    it('fails open when the workflow usage repository rejects after project counts', async () => {
      workflowUsageRepo.increment.mockRejectedValue(new Error('workflow usage table unavailable'));

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failing open'));
      expect(usageRepo.increment).toHaveBeenCalledTimes(2);
      expect(workflowUsageRepo.increment).toHaveBeenCalledTimes(1);
    });

    it('adds the current-week top-up sum to the effective weekly limit', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 11, yearlyCount: 0 });
      topupRepo.sumByProjectIds.mockResolvedValue(new Map([[VALID_PROJECT_ID, 2]]));

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();

      expect(topupRepo.sumByProjectIds).toHaveBeenCalledTimes(1);
      expect(topupRepo.sumByProjectIds).toHaveBeenCalledWith([VALID_PROJECT_ID], periodKeys.weekly);
      expect(usageRepo.increment).toHaveBeenCalledTimes(2);
      expect(workflowUsageRepo.increment).toHaveBeenCalledTimes(2);
    });

    it('reports the top-up-adjusted limit in a weekly breach message', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10, yearlyRateLimit: 1000 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 12, yearlyCount: 50 });
      topupRepo.sumByProjectIds.mockResolvedValue(new Map([[VALID_PROJECT_ID, 2]]));

      const error = (await captureRejection(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      )) as RateLimitExceededError;

      expect(error).toBeInstanceOf(RateLimitExceededError);
      expect(error.message).toContain('limit 12 (base 10 + 2 top-up)');
      expect(error.message).toContain('used 12');
      expect(usageRepo.increment).not.toHaveBeenCalled();
      expect(workflowUsageRepo.increment).not.toHaveBeenCalled();
    });

    it('does not query top-ups when no weekly limit is configured', async () => {
      rateLimitRepo.get.mockResolvedValue(null);

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();

      expect(topupRepo.sumByProjectIds).not.toHaveBeenCalled();
    });

    it('fails open when the top-up repository rejects', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      topupRepo.sumByProjectIds.mockRejectedValue(new Error('top-up table unavailable'));

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failing open'));
      expect(usageRepo.increment).not.toHaveBeenCalled();
      expect(workflowUsageRepo.increment).not.toHaveBeenCalled();
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
      const error = (await captureRejection(
        service.updateRateLimit('unknown-project', body, 'admin@example.com'),
      )) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Project not found');
      expect(rateLimitRepo.upsert).not.toHaveBeenCalled();
    });

    it('upserts the configuration for a known project and returns the stored row', async () => {
      const stored = makeConfigRow(body);
      rateLimitRepo.get.mockResolvedValue(stored);

      const result = await service.updateRateLimit(VALID_PROJECT_ID, body, 'admin@example.com');

      expect(result).toBe(stored);
      expect(rateLimitRepo.upsert).toHaveBeenCalledWith({
        projectId: VALID_PROJECT_ID,
        ...body,
        updatedBy: 'admin@example.com',
      });
      expect(rateLimitRepo.get).toHaveBeenCalledWith(VALID_PROJECT_ID);
    });

    it('trims surrounding whitespace from the recorded admin email', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow(body));

      await service.updateRateLimit(VALID_PROJECT_ID, body, '  admin@example.com  ');

      expect(rateLimitRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ updatedBy: 'admin@example.com' }));
    });

    it('stores null when the admin email is empty or whitespace only', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow(body));

      await service.updateRateLimit(VALID_PROJECT_ID, body, '   ');

      expect(rateLimitRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ updatedBy: null }));
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
      n8nRepos.projectRelation.countMembersByProjectIds.mockResolvedValue(new Map([[VALID_PROJECT_ID, 2]]));

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
      expect(n8nRepos.projectRelation.countMembersByProjectIds).toHaveBeenCalledTimes(1);
      expect(n8nRepos.projectRelation.countMembersByProjectIds).toHaveBeenCalledWith(['proj-001', 'proj-002']);
      expect(topupRepo.sumByProjectIds).toHaveBeenCalledTimes(1);
      expect(topupRepo.sumByProjectIds).toHaveBeenCalledWith(['proj-001', 'proj-002'], periodKeys.weekly);
      expect(result['proj-001']).toEqual({
        weeklyRateLimit: 10,
        yearlyRateLimit: 1000,
        stopBehavior: 'soft_stop',
        lastAdminComment: 'Cap for FY',
        weeklyExecutionCount: 3,
        yearlyExecutionCount: 30,
        weeklyTopupRuns: 0,
        workflowCount: 5,
        membersCount: 2,
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedByName: null,
      });
      expect(result['proj-002']).toEqual({
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        stopBehavior: null,
        lastAdminComment: null,
        weeklyExecutionCount: 0,
        yearlyExecutionCount: 0,
        weeklyTopupRuns: 0,
        workflowCount: 0,
        membersCount: 0,
        updatedAt: null,
        updatedByName: null,
      });
      expect(n8nRepos.user.manager.query).not.toHaveBeenCalled();
    });

    it('carries the current-week top-up sum into the enrichment', async () => {
      topupRepo.sumByProjectIds.mockResolvedValue(new Map([[VALID_PROJECT_ID, 2000]]));

      const result = await service.enrichAdminProjects([{ projectId: VALID_PROJECT_ID }]);

      expect(result[VALID_PROJECT_ID]?.weeklyTopupRuns).toBe(2000);
    });

    it('resolves editor display names by email and formats them as F. Last', async () => {
      const configRow = makeConfigRow({
        updatedBy: 'Ada.Lovelace@Example.com',
        updatedAt: new Date('2026-03-05T10:00:00Z'),
      });
      rateLimitRepo.listByProjectIds.mockResolvedValue(new Map([[VALID_PROJECT_ID, configRow]]));
      n8nRepos.user.manager.query.mockResolvedValue([
        { email: 'ada.lovelace@example.com', firstName: 'Ada', lastName: 'Lovelace' },
      ]);

      const result = await service.enrichAdminProjects([{ projectId: VALID_PROJECT_ID }]);

      expect(result[VALID_PROJECT_ID]).toEqual({
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        stopBehavior: 'hard_stop',
        lastAdminComment: null,
        weeklyExecutionCount: 0,
        yearlyExecutionCount: 0,
        weeklyTopupRuns: 0,
        workflowCount: 0,
        membersCount: 0,
        updatedAt: '2026-03-05T10:00:00.000Z',
        updatedByName: 'A. Lovelace',
      });
      expect(n8nRepos.user.manager.query).toHaveBeenCalledTimes(1);
      expect(n8nRepos.user.manager.query).toHaveBeenCalledWith(expect.any(String), [['ada.lovelace@example.com']]);
    });

    it('falls back to the raw stored email when no n8n user matches it', async () => {
      rateLimitRepo.listByProjectIds.mockResolvedValue(
        new Map([[VALID_PROJECT_ID, makeConfigRow({ updatedBy: 'ghost@example.com' })]]),
      );
      n8nRepos.user.manager.query.mockResolvedValue([]);

      const result = await service.enrichAdminProjects([{ projectId: VALID_PROJECT_ID }]);

      expect(result[VALID_PROJECT_ID]?.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(result[VALID_PROJECT_ID]?.updatedByName).toBe('ghost@example.com');
    });

    it('degrades only the editor name to null when the user lookup fails', async () => {
      rateLimitRepo.listByProjectIds.mockResolvedValue(
        new Map([[VALID_PROJECT_ID, makeConfigRow({ weeklyRateLimit: 7, updatedBy: 'admin@example.com' })]]),
      );
      n8nRepos.user.manager.query.mockRejectedValue(new Error('user lookup failed'));

      const result = await service.enrichAdminProjects([{ projectId: VALID_PROJECT_ID }]);

      expect(result[VALID_PROJECT_ID]).toEqual({
        weeklyRateLimit: 7,
        yearlyRateLimit: null,
        stopBehavior: 'hard_stop',
        lastAdminComment: null,
        weeklyExecutionCount: 0,
        yearlyExecutionCount: 0,
        weeklyTopupRuns: 0,
        workflowCount: 0,
        membersCount: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedByName: null,
      });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('display names'));
    });

    it('skips the name lookup when no config row records an editor email', async () => {
      rateLimitRepo.listByProjectIds.mockResolvedValue(
        new Map([[VALID_PROJECT_ID, makeConfigRow({ updatedBy: '   ' })]]),
      );

      const result = await service.enrichAdminProjects([{ projectId: VALID_PROJECT_ID }]);

      expect(result[VALID_PROJECT_ID]?.updatedByName).toBeNull();
      expect(n8nRepos.user.manager.query).not.toHaveBeenCalled();
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
        weeklyTopupRuns: 0,
        workflowCount: 0,
        membersCount: 0,
        updatedAt: null,
        updatedByName: null,
      });
      expect(result['proj-002']).toEqual({
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        stopBehavior: null,
        lastAdminComment: null,
        weeklyExecutionCount: 0,
        yearlyExecutionCount: 0,
        weeklyTopupRuns: 0,
        workflowCount: 0,
        membersCount: 0,
        updatedAt: null,
        updatedByName: null,
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

  describe('getProjectWorkflowUsage', () => {
    it('throws AppError 404 for an unknown project', async () => {
      const error = (await captureRejection(service.getProjectWorkflowUsage('unknown-project'))) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Project not found');
      expect(n8nRepos.sharedWorkflow.findWorkflowRowsByProjectIds).not.toHaveBeenCalled();
      expect(workflowUsageRepo.listCountsByWorkflowIds).not.toHaveBeenCalled();
    });

    it('returns per-workflow current-period usage sorted by workflow name', async () => {
      n8nRepos.sharedWorkflow.findWorkflowRowsByProjectIds.mockResolvedValue([
        { workflowId: 'wf-200', workflowName: 'Zeta workflow', projectId: VALID_PROJECT_ID },
        { workflowId: 'wf-100', workflowName: 'Alpha workflow', projectId: VALID_PROJECT_ID },
      ]);
      workflowUsageRepo.listCountsByWorkflowIds.mockResolvedValue(
        new Map([
          ['wf-100', { weeklyCount: 3, yearlyCount: 30 }],
          ['wf-200', { weeklyCount: 1, yearlyCount: 10 }],
        ]),
      );

      const result = await service.getProjectWorkflowUsage(VALID_PROJECT_ID);

      expect(n8nRepos.sharedWorkflow.findWorkflowRowsByProjectIds).toHaveBeenCalledWith([VALID_PROJECT_ID]);
      expect(workflowUsageRepo.listCountsByWorkflowIds).toHaveBeenCalledWith(
        VALID_PROJECT_ID,
        ['wf-200', 'wf-100'],
        periodKeys.weekly,
        periodKeys.yearly,
      );
      expect(result).toEqual({
        projectId: VALID_PROJECT_ID,
        weeklyPeriodKey: periodKeys.weekly,
        yearlyPeriodKey: periodKeys.yearly,
        workflows: [
          { workflowId: 'wf-100', workflowName: 'Alpha workflow', weeklyCount: 3, yearlyCount: 30 },
          { workflowId: 'wf-200', workflowName: 'Zeta workflow', weeklyCount: 1, yearlyCount: 10 },
        ],
      });
    });

    it('zero-fills workflows without usage and drops usage rows for workflows no longer in the project', async () => {
      n8nRepos.sharedWorkflow.findWorkflowRowsByProjectIds.mockResolvedValue([
        { workflowId: 'wf-100', workflowName: 'Alpha workflow', projectId: VALID_PROJECT_ID },
      ]);
      workflowUsageRepo.listCountsByWorkflowIds.mockResolvedValue(
        new Map([
          ['wf-100', { weeklyCount: 0, yearlyCount: 0 }],
          ['wf-999', { weeklyCount: 99, yearlyCount: 99 }],
        ]),
      );

      const result = await service.getProjectWorkflowUsage(VALID_PROJECT_ID);

      expect(result.workflows).toEqual([
        { workflowId: 'wf-100', workflowName: 'Alpha workflow', weeklyCount: 0, yearlyCount: 0 },
      ]);
    });

    it('returns an empty workflow list when the project has no workflows', async () => {
      n8nRepos.sharedWorkflow.findWorkflowRowsByProjectIds.mockResolvedValue([]);

      const result = await service.getProjectWorkflowUsage(VALID_PROJECT_ID);

      expect(result.workflows).toEqual([]);
      expect(workflowUsageRepo.listCountsByWorkflowIds).toHaveBeenCalledWith(
        VALID_PROJECT_ID,
        [],
        periodKeys.weekly,
        periodKeys.yearly,
      );
    });
  });

  describe('listProjectTopups', () => {
    it('throws AppError 404 for an unknown project', async () => {
      const error = (await captureRejection(service.listProjectTopups('unknown-project', 1, 4))) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Project not found');
      expect(topupRepo.list).not.toHaveBeenCalled();
    });

    it('returns stored rows serialized with page metadata', async () => {
      topupRepo.list.mockResolvedValue({ rows: [makeProjectTopupRow()], totalItems: 5 });

      const result = await service.listProjectTopups(VALID_PROJECT_ID, 2, 4);

      expect(topupRepo.list).toHaveBeenCalledWith(VALID_PROJECT_ID, 2, 4);
      expect(result.data).toEqual([
        {
          id: VALID_TOPUP_ID,
          projectId: VALID_PROJECT_ID,
          periodKey: '2026-W44',
          amount: 2000,
          adminComment: 'Extra runs for the quarterly batch',
          createdBy: 'test@example.com',
          createdAt: '2025-06-01T12:00:00.000Z',
        },
      ]);
      expect(result.pagination).toEqual({ page: 2, pageSize: 4, totalItems: 5, totalPages: 2 });
    });

    it('reports at least one total page for a project without top-ups', async () => {
      const result = await service.listProjectTopups(VALID_PROJECT_ID, 1, 4);

      expect(result).toEqual({
        data: [],
        pagination: { page: 1, pageSize: 4, totalItems: 0, totalPages: 1 },
      });
    });
  });

  describe('createProjectTopup', () => {
    it('throws AppError 404 for an unknown project', async () => {
      const error = (await captureRejection(
        service.createProjectTopup(
          'unknown-project',
          { periodKey: periodKeys.weekly, amount: 100, adminComment: 'Extra runs' },
          'admin@example.com',
        ),
      )) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Project not found');
      expect(topupRepo.create).not.toHaveBeenCalled();
    });

    it('stores the top-up with a trimmed comment and creator email and returns the stored row', async () => {
      const stored = makeProjectTopupRow({ periodKey: periodKeys.weekly, amount: 100 });
      topupRepo.create.mockResolvedValue(stored);

      const result = await service.createProjectTopup(
        VALID_PROJECT_ID,
        { periodKey: periodKeys.weekly, amount: 100, adminComment: '  Extra runs  ' },
        '  admin@example.com  ',
      );

      expect(result).toBe(stored);
      expect(topupRepo.create).toHaveBeenCalledWith({
        projectId: VALID_PROJECT_ID,
        periodKey: periodKeys.weekly,
        amount: 100,
        adminComment: 'Extra runs',
        createdBy: 'admin@example.com',
      });
    });

    it('stores null when the creator email is empty or whitespace only', async () => {
      await service.createProjectTopup(
        VALID_PROJECT_ID,
        { periodKey: periodKeys.weekly, amount: 100, adminComment: 'Extra runs' },
        '   ',
      );

      expect(topupRepo.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: null }));
    });

    it('accepts the current week and the far edge of the top-up horizon', async () => {
      const keys = listUpcomingWeeklyPeriodKeys(MAX_TOPUP_HORIZON_WEEKS);

      await expect(
        service.createProjectTopup(VALID_PROJECT_ID, { periodKey: keys[0], amount: 1, adminComment: 'why' }, null),
      ).resolves.toBeTruthy();
      await expect(
        service.createProjectTopup(
          VALID_PROJECT_ID,
          { periodKey: keys[keys.length - 1], amount: 1_000_000, adminComment: 'why' },
          null,
        ),
      ).resolves.toBeTruthy();

      expect(topupRepo.create).toHaveBeenCalledTimes(2);
    });

    it('throws AppError 400 for a period key beyond the top-up horizon', async () => {
      const beyondHorizon = getWeeklyPeriodKey(new Date(Date.now() + (MAX_TOPUP_HORIZON_WEEKS + 1) * 7 * 86_400_000));

      const error = (await captureRejection(
        service.createProjectTopup(
          VALID_PROJECT_ID,
          { periodKey: beyondHorizon, amount: 100, adminComment: 'Extra runs' },
          null,
        ),
      )) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('periodKey must be the current week or a coming week within the top-up horizon');
      expect(topupRepo.create).not.toHaveBeenCalled();
    });

    it('throws AppError 400 for a malformed period key', async () => {
      const error = (await captureRejection(
        service.createProjectTopup(
          VALID_PROJECT_ID,
          { periodKey: '2026-10-27', amount: 100, adminComment: 'Extra runs' },
          null,
        ),
      )) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('periodKey must match the weekly format YYYY-Www');
      expect(topupRepo.create).not.toHaveBeenCalled();
    });

    it('accepts the minimum and maximum amounts', async () => {
      await service.createProjectTopup(
        VALID_PROJECT_ID,
        { periodKey: periodKeys.weekly, amount: 1, adminComment: 'why' },
        null,
      );
      await service.createProjectTopup(
        VALID_PROJECT_ID,
        { periodKey: periodKeys.weekly, amount: 1_000_000, adminComment: 'why' },
        null,
      );

      expect(topupRepo.create).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 1_000_000 }));
      expect(topupRepo.create).toHaveBeenCalledTimes(2);
    });

    it.each([0, -5, 1.5, 1_000_001])('throws AppError 400 for an amount of %s', async (amount) => {
      const error = (await captureRejection(
        service.createProjectTopup(
          VALID_PROJECT_ID,
          { periodKey: periodKeys.weekly, amount, adminComment: 'Extra runs' },
          null,
        ),
      )) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('amount must be a whole number between 1 and 1000000');
      expect(topupRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteProjectTopup', () => {
    it('throws AppError 404 for an unknown project', async () => {
      const error = (await captureRejection(service.deleteProjectTopup('unknown-project', VALID_TOPUP_ID))) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Project not found');
      expect(topupRepo.getById).not.toHaveBeenCalled();
      expect(topupRepo.deleteById).not.toHaveBeenCalled();
    });

    it('throws AppError 404 when the top-up row does not exist', async () => {
      topupRepo.getById.mockResolvedValue(null);

      const error = (await captureRejection(service.deleteProjectTopup(VALID_PROJECT_ID, VALID_TOPUP_ID))) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Top-up not found');
      expect(topupRepo.deleteById).not.toHaveBeenCalled();
    });

    it('throws AppError 409 when the target week has already started', async () => {
      topupRepo.getById.mockResolvedValue(makeProjectTopupRow({ periodKey: '2020-W01' }));

      const error = (await captureRejection(service.deleteProjectTopup(VALID_PROJECT_ID, VALID_TOPUP_ID))) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Top-ups for the current or past weeks cannot be deleted');
      expect(topupRepo.deleteById).not.toHaveBeenCalled();
    });

    it('throws AppError 409 when the target week is the current week', async () => {
      topupRepo.getById.mockResolvedValue(makeProjectTopupRow({ periodKey: periodKeys.weekly }));

      const error = (await captureRejection(service.deleteProjectTopup(VALID_PROJECT_ID, VALID_TOPUP_ID))) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(409);
      expect(topupRepo.deleteById).not.toHaveBeenCalled();
    });

    it('deletes a top-up whose target week has not started', async () => {
      const nextWeek = listUpcomingWeeklyPeriodKeys(2)[1];
      topupRepo.getById.mockResolvedValue(makeProjectTopupRow({ periodKey: nextWeek }));

      await expect(service.deleteProjectTopup(VALID_PROJECT_ID, VALID_TOPUP_ID)).resolves.toBeUndefined();

      expect(topupRepo.getById).toHaveBeenCalledWith(VALID_PROJECT_ID, VALID_TOPUP_ID);
      expect(topupRepo.deleteById).toHaveBeenCalledWith(VALID_TOPUP_ID);
    });
  });
});
