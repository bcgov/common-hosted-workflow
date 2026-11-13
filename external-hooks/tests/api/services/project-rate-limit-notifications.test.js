'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const project_rate_limit_service_1 = require('../../../src/api/services/project-rate-limit.service');
const period_1 = require('../../../src/api/helpers/period');
const user_1 = require('../../../src/db/repository/n8n/user');
const mocks_1 = require('../../helpers/mocks');
/** Captures the rejection reason; fails the test when the promise resolves. */
async function captureRejection(promise) {
  return promise.then(
    () => {
      throw new Error('Expected the call to reject');
    },
    (error) => error,
  );
}
/** Lets the fire-and-forget notification promises (all-mocked, instant) settle. */
async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}
function makeConfigRow(overrides = {}) {
  return {
    projectId: mocks_1.VALID_PROJECT_ID,
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
(0, vitest_1.describe)('ProjectRateLimitService notifications', () => {
  let n8nRepos;
  let rateLimitRepo;
  let defaultsRepo;
  let usageRepo;
  let topupRepo;
  let notificationRepo;
  let mailer;
  let service;
  let warnSpy;
  let errorSpy;
  let findAdminEmailsSpy;
  let periodKeys;
  (0, vitest_1.beforeEach)(() => {
    n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    rateLimitRepo = (0, mocks_1.createMockProjectRateLimitRepository)();
    defaultsRepo = (0, mocks_1.createMockProjectRateLimitDefaultRepository)();
    usageRepo = (0, mocks_1.createMockProjectExecutionUsageRepository)();
    topupRepo = (0, mocks_1.createMockProjectTopupRepository)();
    notificationRepo = (0, mocks_1.createMockRateLimitNotificationRepository)();
    mailer = { sendMail: vitest_1.vi.fn().mockResolvedValue(undefined), sender: 'noreply@test' };
    // The real user repository wrapper so findAdminEmails can be spied.
    service = new project_rate_limit_service_1.ProjectRateLimitService(
      { ...n8nRepos, user: new user_1.UserRepository(n8nRepos.user) },
      {
        projectRateLimit: rateLimitRepo,
        projectRateLimitDefault: defaultsRepo,
        projectExecutionUsage: usageRepo,
        projectTopup: topupRepo,
        rateLimitNotification: notificationRepo,
      },
      mailer,
    );
    warnSpy = vitest_1.vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vitest_1.vi.spyOn(console, 'error').mockImplementation(() => {});
    periodKeys = (0, period_1.getCurrentPeriodKeys)();
    // Default recipient wiring: two project admins/editors, one platform admin.
    n8nRepos.projectRelation.listMemberEmailsByProjectIdsAndRoles.mockResolvedValue(
      new Map([[mocks_1.VALID_PROJECT_ID, ['editor@test.com', 'padmin@test.com']]]),
    );
    vitest_1.vi
      .spyOn(user_1.UserRepository.prototype, 'findAdminEmails')
      .mockResolvedValue(['platform-admin@test.com']);
    findAdminEmailsSpy = user_1.UserRepository.prototype.findAdminEmails;
  });
  (0, vitest_1.afterEach)(() => {
    vitest_1.vi.restoreAllMocks();
  });
  (0, vitest_1.describe)('enforcement-time events', () => {
    (0, vitest_1.it)(
      'sends one hard-stop reached email to project admins/editors plus platform admins when a weekly breach rejects a run',
      async () => {
        rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
        usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });
        const error = await captureRejection(
          service.enforceExecution({ workflowId: mocks_1.VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
        );
        (0, vitest_1.expect)(error).toBeInstanceOf(project_rate_limit_service_1.RateLimitExceededError);
        await flushAsync();
        (0, vitest_1.expect)(notificationRepo.claim).toHaveBeenCalledWith({
          projectId: mocks_1.VALID_PROJECT_ID,
          periodKey: periodKeys.weekly,
          eventKind: 'weekly_reached_hard',
          usageCount: 10,
        });
        (0, vitest_1.expect)(mailer.sendMail).toHaveBeenCalledTimes(3);
        const recipients = mailer.sendMail.mock.calls.map((call) => call[0].to).sort();
        (0, vitest_1.expect)(recipients).toEqual(['editor@test.com', 'padmin@test.com', 'platform-admin@test.com']);
        const { subject, html } = mailer.sendMail.mock.calls[0][0];
        (0, vitest_1.expect)(subject).toContain('weekly limit reached');
        (0, vitest_1.expect)(html).toContain('Default project');
        (0, vitest_1.expect)(html).toContain('New workflow runs are paused');
        (0, vitest_1.expect)(findAdminEmailsSpy).toHaveBeenCalledTimes(1);
      },
    );
    (0, vitest_1.it)(
      'sends a soft-stop reached email without platform admins and without rejecting the run',
      async () => {
        rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10, stopBehavior: 'soft_stop' }));
        usageRepo.getCounts.mockResolvedValue({ weeklyCount: 12, yearlyCount: 0 });
        const findAdminEmails = vitest_1.vi.spyOn(user_1.UserRepository.prototype, 'findAdminEmails');
        await (0, vitest_1.expect)(
          service.enforceExecution({ workflowId: mocks_1.VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
        ).resolves.toBeUndefined();
        await flushAsync();
        (0, vitest_1.expect)(notificationRepo.claim).toHaveBeenCalledWith({
          projectId: mocks_1.VALID_PROJECT_ID,
          periodKey: periodKeys.weekly,
          eventKind: 'weekly_reached_soft',
          usageCount: 12,
        });
        (0, vitest_1.expect)(mailer.sendMail).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(mailer.sendMail.mock.calls[0][0].html).toContain('Runs continue in the meantime');
        (0, vitest_1.expect)(findAdminEmailsSpy).not.toHaveBeenCalled();
      },
    );
    (0, vitest_1.it)('sends a near-limit email at the 80% threshold with the effective limit in the text', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 100 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 82, yearlyCount: 0 });
      topupRepo.sumByProjectIds.mockResolvedValue(new Map([[mocks_1.VALID_PROJECT_ID, 0]]));
      await (0, vitest_1.expect)(
        service.enforceExecution({ workflowId: mocks_1.VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();
      await flushAsync();
      (0, vitest_1.expect)(notificationRepo.claim).toHaveBeenCalledWith({
        projectId: mocks_1.VALID_PROJECT_ID,
        periodKey: periodKeys.weekly,
        eventKind: 'weekly_near_80',
        usageCount: 82,
      });
      const { subject, html } = mailer.sendMail.mock.calls[0][0];
      (0, vitest_1.expect)(subject).toContain('at 82%');
      (0, vitest_1.expect)(html).toContain('82%');
      (0, vitest_1.expect)(html).toContain('100');
    });
    (0, vitest_1.it)(
      'sends a near-limit email at the 50% threshold and skips 80% when usage jumped past it',
      async () => {
        rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 100 }));
        usageRepo.getCounts.mockResolvedValue({ weeklyCount: 85, yearlyCount: 0 });
        topupRepo.sumByProjectIds.mockResolvedValue(new Map([[mocks_1.VALID_PROJECT_ID, 0]]));
        await (0, vitest_1.expect)(
          service.enforceExecution({ workflowId: mocks_1.VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
        ).resolves.toBeUndefined();
        await flushAsync();
        // Highest applicable threshold only: 50% was never claimed.
        const claimedKinds = notificationRepo.claim.mock.calls.map((call) => call[0].eventKind);
        (0, vitest_1.expect)(claimedKinds).toEqual(['weekly_near_80']);
        (0, vitest_1.expect)(mailer.sendMail).toHaveBeenCalledTimes(2);
      },
    );
    (0, vitest_1.it)('does not claim or send anything below the 50% threshold', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 100, yearlyRateLimit: 1000 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 49, yearlyCount: 499 });
      topupRepo.sumByProjectIds.mockResolvedValue(new Map());
      topupRepo.sumByProjectIdsInWeeklyKeys.mockResolvedValue(new Map());
      await (0, vitest_1.expect)(
        service.enforceExecution({ workflowId: mocks_1.VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).resolves.toBeUndefined();
      await flushAsync();
      (0, vitest_1.expect)(notificationRepo.claim).not.toHaveBeenCalled();
      (0, vitest_1.expect)(mailer.sendMail).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('stays silent when the claim was already taken by another run', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });
      notificationRepo.claim.mockResolvedValue(false);
      await (0, vitest_1.expect)(
        service.enforceExecution({ workflowId: mocks_1.VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).rejects.toBeInstanceOf(project_rate_limit_service_1.RateLimitExceededError);
      await flushAsync();
      (0, vitest_1.expect)(mailer.sendMail).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('notifies from a non-counting process too (queue-mode main pre-check)', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });
      await (0, vitest_1.expect)(
        service.enforceExecution({ workflowId: mocks_1.VALID_WORKFLOW_ID, mode: 'trigger', countUsage: false }),
      ).rejects.toBeInstanceOf(project_rate_limit_service_1.RateLimitExceededError);
      await flushAsync();
      (0, vitest_1.expect)(usageRepo.increment).not.toHaveBeenCalled();
      (0, vitest_1.expect)(mailer.sendMail).toHaveBeenCalledTimes(3);
    });
    (0, vitest_1.it)('keeps enforcing when the email send fails; the failure is logged, never thrown', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });
      mailer.sendMail.mockRejectedValue(new Error('SMTP down'));
      await (0, vitest_1.expect)(
        service.enforceExecution({ workflowId: mocks_1.VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).rejects.toBeInstanceOf(project_rate_limit_service_1.RateLimitExceededError);
      await flushAsync();
      (0, vitest_1.expect)(errorSpy).toHaveBeenCalled();
    });
    (0, vitest_1.it)('skips notifications entirely without a mailer (no claims, no errors)', async () => {
      const bareService = new project_rate_limit_service_1.ProjectRateLimitService(
        { ...n8nRepos, user: new user_1.UserRepository(n8nRepos.user) },
        {
          projectRateLimit: rateLimitRepo,
          projectRateLimitDefault: defaultsRepo,
          projectExecutionUsage: usageRepo,
          projectTopup: topupRepo,
          rateLimitNotification: notificationRepo,
        },
      );
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 10 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 10, yearlyCount: 0 });
      await (0, vitest_1.expect)(
        bareService.enforceExecution({ workflowId: mocks_1.VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).rejects.toBeInstanceOf(project_rate_limit_service_1.RateLimitExceededError);
      await flushAsync();
      (0, vitest_1.expect)(notificationRepo.claim).not.toHaveBeenCalled();
      (0, vitest_1.expect)(mailer.sendMail).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('treats a yearly hard-stop breach as its own event with the annual reset date', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 1_000_000, yearlyRateLimit: 1000 }));
      usageRepo.getCounts.mockResolvedValue({ weeklyCount: 0, yearlyCount: 1000 });
      topupRepo.sumByProjectIds.mockResolvedValue(new Map());
      topupRepo.sumByProjectIdsInWeeklyKeys.mockResolvedValue(new Map());
      await (0, vitest_1.expect)(
        service.enforceExecution({ workflowId: mocks_1.VALID_WORKFLOW_ID, mode: 'trigger', countUsage: true }),
      ).rejects.toBeInstanceOf(project_rate_limit_service_1.RateLimitExceededError);
      await flushAsync();
      (0, vitest_1.expect)(notificationRepo.claim).toHaveBeenCalledWith({
        projectId: mocks_1.VALID_PROJECT_ID,
        periodKey: periodKeys.yearly,
        eventKind: 'yearly_reached_hard',
        usageCount: 1000,
      });
      const { subject, html } = mailer.sendMail.mock.calls[0][0];
      (0, vitest_1.expect)(subject).toContain('annual limit reached');
      (0, vitest_1.expect)(html).toContain('January 1, 2027');
    });
  });
  (0, vitest_1.describe)('config-time events', () => {
    (0, vitest_1.it)('sends a top-up granted email with the formatted week description', async () => {
      const periodKey = (0, period_1.listUpcomingWeeklyPeriodKeys)(2)[1];
      const weekDescription = (0, period_1.describeWeeklyPeriodKey)(periodKey);
      (0, vitest_1.expect)(weekDescription).toBeTypeOf('string');
      topupRepo.create.mockResolvedValue(
        (0, mocks_1.makeProjectTopupRow)({ projectId: mocks_1.VALID_PROJECT_ID, periodKey, amount: 2000 }),
      );
      await service.createProjectTopup(
        mocks_1.VALID_PROJECT_ID,
        { periodKey, amount: 2000, adminComment: 'Quarterly batch' },
        'admin.user@testapp.com',
      );
      await flushAsync();
      (0, vitest_1.expect)(mailer.sendMail).toHaveBeenCalledTimes(2);
      const { subject, html } = mailer.sendMail.mock.calls[0][0];
      (0, vitest_1.expect)(subject).toContain('Extra runs added');
      (0, vitest_1.expect)(html).toContain('2,000');
      (0, vitest_1.expect)(html).toContain("was added to Default project's weekly limit");
      (0, vitest_1.expect)(html).toContain(weekDescription);
    });
    (0, vitest_1.it)('sends a limits-changed email with the enforced limits in custom mode', async () => {
      rateLimitRepo.get.mockResolvedValue(makeConfigRow({ weeklyRateLimit: 5000, yearlyRateLimit: 200000 }));
      await service.updateRateLimit(
        mocks_1.VALID_PROJECT_ID,
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
      (0, vitest_1.expect)(mailer.sendMail).toHaveBeenCalledTimes(2);
      const { subject, html } = mailer.sendMail.mock.calls[0][0];
      (0, vitest_1.expect)(subject).toContain('Execution limits updated');
      (0, vitest_1.expect)(html).toContain('5,000 runs');
      (0, vitest_1.expect)(html).toContain('200,000 runs');
      (0, vitest_1.expect)(html).toContain('admin.user@testapp.com');
    });
    (0, vitest_1.it)('sends the scope defaults in the limits-changed email in default mode', async () => {
      const defaultsRepo = (0, mocks_1.createMockProjectRateLimitDefaultRepository)();
      defaultsRepo.get.mockResolvedValue({
        projectKind: 'personal',
        weeklyRateLimit: 1000,
        yearlyRateLimit: 50000,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const defaultsService = new project_rate_limit_service_1.ProjectRateLimitService(
        { ...n8nRepos, user: new user_1.UserRepository(n8nRepos.user) },
        {
          projectRateLimit: rateLimitRepo,
          projectRateLimitDefault: defaultsRepo,
          projectExecutionUsage: usageRepo,
          projectTopup: topupRepo,
          rateLimitNotification: notificationRepo,
        },
        mailer,
      );
      rateLimitRepo.get.mockResolvedValue(
        makeConfigRow({ usesDefaultLimits: true, weeklyRateLimit: null, yearlyRateLimit: null }),
      );
      await defaultsService.updateRateLimit(
        mocks_1.VALID_PROJECT_ID,
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
      (0, vitest_1.expect)(html).toContain('1,000 runs');
      (0, vitest_1.expect)(html).toContain('50,000 runs');
    });
    (0, vitest_1.it)('does not send email for deleted top-ups', async () => {
      topupRepo.getById.mockResolvedValue((0, mocks_1.makeProjectTopupRow)({ periodKey: '2099-W01' }));
      await service.deleteProjectTopup(mocks_1.VALID_PROJECT_ID, 'topup-1');
      await flushAsync();
      (0, vitest_1.expect)(mailer.sendMail).not.toHaveBeenCalled();
    });
  });
});
