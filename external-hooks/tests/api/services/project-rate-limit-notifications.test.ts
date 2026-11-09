import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectRateLimitService, RateLimitExceededError } from '../../../src/api/services/project-rate-limit.service';
import type { NodeMailerService } from '../../../src/api/services/node-mailer';
import {
  describeWeeklyPeriodKey,
  getCurrentPeriodKeys,
  listUpcomingWeeklyPeriodKeys,
} from '../../../src/api/helpers/period';
import type { ProjectRateLimit } from '../../../src/db/schema/project-rate-limit';
import { UserRepository } from '../../../src/db/repository/n8n/user';
import {
  VALID_PROJECT_ID,
  VALID_WORKFLOW_ID,
  createMockN8nRepositories,
  createMockProjectExecutionUsageRepository,
  createMockProjectRateLimitDefaultRepository,
  createMockProjectRateLimitRepository,
  createMockProjectTopupRepository,
  createMockRateLimitNotificationRepository,
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

/** Lets the fire-and-forget notification promises (all-mocked, instant) settle. */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeConfigRow(overrides: Partial<ProjectRateLimit> = {}): ProjectRateLimit {
  return {
    projectId: VALID_PROJECT_ID,
    usesDefaultLimits: false,
    weeklyRateLimit: null,
    yearlyRateLimit: null,
    lastAdminComment: null,
    stopBehavior: 'hard_stop',
    updatedBy: 'admin.user@testapp.com',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('ProjectRateLimitService notifications', () => {
  let n8nRepos: ReturnType<typeof createMockN8nRepositories>;
  let rateLimitRepo: ReturnType<typeof createMockProjectRateLimitRepository>;
  let defaultsRepo: ReturnType<typeof createMockProjectRateLimitDefaultRepository>;
  let usageRepo: ReturnType<typeof createMockProjectExecutionUsageRepository>;
  let topupRepo: ReturnType<typeof createMockProjectTopupRepository>;
  let notificationRepo: ReturnType<typeof createMockRateLimitNotificationRepository>;
  let mailer: { sendMail: ReturnType<typeof vi.fn>; sender: string };
  let service: ProjectRateLimitService;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let findAdminEmailsSpy: ReturnType<typeof vi.fn>;
  let periodKeys: { weekly: string; yearly: string };

  beforeEach(() => {
    n8nRepos = createMockN8nRepositories();
    rateLimitRepo = createMockProjectRateLimitRepository();
    defaultsRepo = createMockProjectRateLimitDefaultRepository();
    usageRepo = createMockProjectExecutionUsageRepository();
    topupRepo = createMockProjectTopupRepository();
    notificationRepo = createMockRateLimitNotificationRepository();
    mailer = { sendMail: vi.fn().mockResolvedValue(undefined), sender: 'noreply@test' };
    // The real user repository wrapper so findAdminEmails can be spied.
    service = new ProjectRateLimitService(
      { ...n8nRepos, user: new UserRepository(n8nRepos.user as any) } as any,
      {
        projectRateLimit: rateLimitRepo,
        projectRateLimitDefault: defaultsRepo,
        projectExecutionUsage: usageRepo,
        projectTopup: topupRepo,
        rateLimitNotification: notificationRepo,
      } as any,
      mailer as unknown as NodeMailerService,
    );
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    periodKeys = getCurrentPeriodKeys();

    // Default recipient wiring: two project admins/editors, one platform admin.
    n8nRepos.projectRelation.listMemberEmailsByProjectIdsAndRoles.mockResolvedValue(
      new Map([[VALID_PROJECT_ID, ['editor@test.com', 'padmin@test.com']]]),
    );
    vi.spyOn(UserRepository.prototype, 'findAdminEmails').mockResolvedValue(['platform-admin@test.com']);
    findAdminEmailsSpy = UserRepository.prototype.findAdminEmails as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('enforcement-time events', () => {
    it('sends one hard-stop reached email to project admins/editors plus platform admins when a weekly breach rejects a run', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });

      const error = (await captureRejection(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      )) as RateLimitExceededError;

      expect(error).toBeInstanceOf(RateLimitExceededError);
      await flushAsync();

      expect(notificationRepo.claim).toHaveBeenCalledWith({
        projectId: VALID_PROJECT_ID,
        periodKey: periodKeys.weekly,
        eventKind: 'weekly_reached_hard',
        usageCount: 10,
      });
      expect(mailer.sendMail).toHaveBeenCalledTimes(3);
      const recipients = mailer.sendMail.mock.calls.map((call) => call[0].to).sort();
      expect(recipients).toEqual(['editor@test.com', 'padmin@test.com', 'platform-admin@test.com']);
      const { subject, html } = mailer.sendMail.mock.calls[0][0];
      expect(subject).toContain('weekly limit reached');
      expect(html).toContain('Default project');
      expect(html).toContain('New workflow runs are paused');
      expect(findAdminEmailsSpy).toHaveBeenCalledTimes(1);
    });

    it('sends a soft-stop reached email without platform admins and without rejecting the run', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10, stopBehavior: 'soft_stop' }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 12, yearlyCount: 0 });
      const findAdminEmails = vi.spyOn(UserRepository.prototype, 'findAdminEmails');

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();
      await flushAsync();

      expect(notificationRepo.claim).toHaveBeenCalledWith({
        projectId: VALID_PROJECT_ID,
        periodKey: periodKeys.weekly,
        eventKind: 'weekly_reached_soft',
        usageCount: 12,
      });
      expect(mailer.sendMail).toHaveBeenCalledTimes(2);
      expect(mailer.sendMail.mock.calls[0][0].html).toContain('Runs continue in the meantime');
      expect(findAdminEmailsSpy).not.toHaveBeenCalled();
    });

    it('sends a near-limit email at the 80% threshold with the effective limit in the text', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 100 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 82, yearlyCount: 0 });
      topupRepo.sumByProjectIds.mockResolvedValue(new Map([[VALID_PROJECT_ID, 0]]));

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();
      await flushAsync();

      expect(notificationRepo.claim).toHaveBeenCalledWith({
        projectId: VALID_PROJECT_ID,
        periodKey: periodKeys.weekly,
        eventKind: 'weekly_near_80',
        usageCount: 82,
      });
      const { subject, html } = mailer.sendMail.mock.calls[0][0];
      expect(subject).toContain('at 82%');
      expect(html).toContain('82%');
      expect(html).toContain('100');
    });

    it('sends a near-limit email at the 50% threshold and skips 80% when usage jumped past it', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 100 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 85, yearlyCount: 0 });
      topupRepo.sumByProjectIds.mockResolvedValue(new Map([[VALID_PROJECT_ID, 0]]));

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();
      await flushAsync();

      // Highest applicable threshold only: 50% was never claimed.
      const claimedKinds = notificationRepo.claim.mock.calls.map((call) => call[0].eventKind);
      expect(claimedKinds).toEqual(['weekly_near_80']);
      expect(mailer.sendMail).toHaveBeenCalledTimes(2);
    });

    it('does not claim or send anything below the 50% threshold', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 100, yearlyRateLimit: 1000 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 49, yearlyCount: 499 });
      topupRepo.sumByProjectIds.mockResolvedValue(new Map());
      topupRepo.sumByProjectIdsInWeeklyKeys.mockResolvedValue(new Map());

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();
      await flushAsync();

      expect(notificationRepo.claim).not.toHaveBeenCalled();
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('stays silent when the claim was already taken by another run', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });
      notificationRepo.claim.mockResolvedValue(false);

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).rejects.toBeInstanceOf(RateLimitExceededError);
      await flushAsync();

      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('notifies from a non-counting process too (queue-mode main pre-check)', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: false }),
      ).rejects.toBeInstanceOf(RateLimitExceededError);
      await flushAsync();

      expect(usageRepo.increment).not.toHaveBeenCalled();
      expect(mailer.sendMail).toHaveBeenCalledTimes(3);
    });

    it('keeps enforcing when the email send fails; the failure is logged, never thrown', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });
      mailer.sendMail.mockRejectedValue(new Error('SMTP down'));

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).rejects.toBeInstanceOf(RateLimitExceededError);
      await flushAsync();

      expect(errorSpy).toHaveBeenCalled();
    });

    it('skips notifications entirely without a mailer (no claims, no errors)', async () => {
      const bareService = new ProjectRateLimitService(
        { ...n8nRepos, user: new UserRepository(n8nRepos.user as any) } as any,
        {
          projectRateLimit: rateLimitRepo,
          projectRateLimitDefault: defaultsRepo,
          projectExecutionUsage: usageRepo,
          projectTopup: topupRepo,
          rateLimitNotification: notificationRepo,
        } as any,
      );
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });

      await expect(
        bareService.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).rejects.toBeInstanceOf(RateLimitExceededError);
      await flushAsync();

      expect(notificationRepo.claim).not.toHaveBeenCalled();
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('treats a yearly hard-stop breach as its own event with the annual reset date', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 1_000_000, yearlyRateLimit: 1000 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 0, yearlyCount: 1000 });
      topupRepo.sumByProjectIds.mockResolvedValue(new Map());
      topupRepo.sumByProjectIdsInWeeklyKeys.mockResolvedValue(new Map());

      await expect(
        service.enforceExecution({ workflowId: VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).rejects.toBeInstanceOf(RateLimitExceededError);
      await flushAsync();

      expect(notificationRepo.claim).toHaveBeenCalledWith({
        projectId: VALID_PROJECT_ID,
        periodKey: periodKeys.yearly,
        eventKind: 'yearly_reached_hard',
        usageCount: 1000,
      });
      const { subject, html } = mailer.sendMail.mock.calls[0][0];
      expect(subject).toContain('annual limit reached');
      expect(html).toContain('January 1, 2027');
    });
  });

  describe('config-time events', () => {
    it('sends a top-up granted email with the formatted week description', async () => {
      const periodKey = listUpcomingWeeklyPeriodKeys(2)[1];
      const weekDescription = describeWeeklyPeriodKey(periodKey);
      expect(weekDescription).toBeTypeOf('string');
      topupRepo.create.mockResolvedValue(makeProjectTopupRow({ projectId: VALID_PROJECT_ID, periodKey, amount: 2000 }));

      await service.createProjectTopup(
        VALID_PROJECT_ID,
        { periodKey, amount: 2000, adminComment: 'Quarterly batch' },
        'admin.user@testapp.com',
      );
      await flushAsync();

      expect(mailer.sendMail).toHaveBeenCalledTimes(2);
      const { subject, html } = mailer.sendMail.mock.calls[0][0];
      expect(subject).toContain('Extra runs added');
      expect(html).toContain('2,000');
      expect(html).toContain("was added to Default project's weekly limit");
      expect(html).toContain(weekDescription!);
    });

    it('sends a limits-changed email with the enforced limits in custom mode', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 5000, yearlyRateLimit: 200000 }));

      await service.updateRateLimit(
        VALID_PROJECT_ID,
        {
          usesDefaultLimits: false,
          weeklyRateLimit: 5000,
          yearlyRateLimit: 200000,
          lastAdminComment: 'Tier A',
          stopBehavior: 'hard_stop',
        },
        'admin.user@testapp.com',
      );
      await flushAsync();

      expect(mailer.sendMail).toHaveBeenCalledTimes(2);
      const { subject, html } = mailer.sendMail.mock.calls[0][0];
      expect(subject).toContain('Execution limits updated');
      expect(html).toContain('5,000 runs');
      expect(html).toContain('200,000 runs');
      expect(html).toContain('admin.user@testapp.com');
    });

    it('sends the scope defaults in the limits-changed email in default mode', async () => {
      const defaultsRepo = createMockProjectRateLimitDefaultRepository();
      defaultsRepo.get.mockResolvedValue({
        projectKind: 'personal',
        weeklyRateLimit: 1000,
        yearlyRateLimit: 50000,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      const defaultsService = new ProjectRateLimitService(
        { ...n8nRepos, user: new UserRepository(n8nRepos.user as any) } as any,
        {
          projectRateLimit: rateLimitRepo,
          projectRateLimitDefault: defaultsRepo,
          projectExecutionUsage: usageRepo,
          projectTopup: topupRepo,
          rateLimitNotification: notificationRepo,
        } as any,
        mailer as unknown as NodeMailerService,
      );
      rateLimitRepo.get.mockResolvedValue(
        makeConfigRow({ usesDefaultLimits: true, weeklyRateLimit: null, yearlyRateLimit: null }),
      );

      await defaultsService.updateRateLimit(
        VALID_PROJECT_ID,
        {
          usesDefaultLimits: true,
          weeklyRateLimit: null,
          yearlyRateLimit: null,
          lastAdminComment: 'Back on defaults',
          stopBehavior: 'hard_stop',
        },
        'admin.user@testapp.com',
      );
      await flushAsync();

      const { html } = mailer.sendMail.mock.calls[0][0];
      expect(html).toContain('1,000 runs');
      expect(html).toContain('50,000 runs');
    });

    it('does not send email for deleted top-ups', async () => {
      topupRepo.getById.mockResolvedValue(makeProjectTopupRow({ periodKey: '2099-W01' }));

      await service.deleteProjectTopup(VALID_PROJECT_ID, 'topup-1');
      await flushAsync();

      expect(mailer.sendMail).not.toHaveBeenCalled();
    });
  });
});
