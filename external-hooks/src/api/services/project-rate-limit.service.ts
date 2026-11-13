import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { ProjectRateLimit } from '../../db/schema/project-rate-limit';
import type { ProjectRateLimitDefault } from '../../db/schema/project-rate-limit-default';
import type { ProjectTopup } from '../../db/schema/project-topup';
import type { RateLimitNotificationKind } from '../../db/schema/rate-limit-notification';
import type { RateLimitRequest, RunRequestKind, RunRequestStatus } from '../../db/schema/rate-limit-request';
import type { NodeMailerService } from './node-mailer';
import { extractRoleSlug, getViewerProjectRole } from './project-access';
import { renderEmail } from './email-templates';
import { UI_APP_BASE_URL } from '@config';
import {
  describeWeeklyPeriodKey,
  formatPeriodDateLong,
  getCurrentPeriodKeys,
  getNextWeeklyReset,
  getNextYearlyReset,
  listUpcomingWeeklyPeriodKeys,
  listWeeklyPeriodKeysOverlappingYearlyPeriod,
} from '../helpers/period';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('ProjectRateLimit');

/** Top-ups may target the current week plus the following 25 (≈ half a year). */
export const MAX_TOPUP_HORIZON_WEEKS = 26;

/** Upper bound for a single top-up amount, in runs. */
export const MAX_TOPUP_AMOUNT = 1_000_000;

/**
 * A run request's one-off top-up amount bounds (the dialog's "Between 100 and
 * 50,000 runs") and week horizon: the current week plus the coming 8.
 */
export const RUN_REQUEST_MIN_EXTRA_RUNS = 100;
export const RUN_REQUEST_MAX_EXTRA_RUNS = 50_000;
export const MAX_RUN_REQUEST_HORIZON_WEEKS = 8;

const WEEKLY_KEY_PATTERN = /^\d{4}-W\d{2}$/;

export type RateLimitStopBehavior = 'hard_stop' | 'soft_stop';

/**
 * Thrown when a configured hard-stop rate limit blocks an execution.
 * The workflow.preExecute hook propagates only this error type to n8n
 * (which aborts the run); every other enforcement error fails open.
 */
export class RateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

/** Per-project list enrichment: limit mode, effective limits, current-period usage, workflow count, editor stamp. */
export type ProjectRateLimitEnrichment = {
  /** True when the project follows its scope's saved defaults instead of custom values. */
  usesDefaultLimits: boolean;
  /**
   * Effective enforced base limits (what `enforceExecution` resolves): the
   * project's custom values when configured, otherwise its scope's defaults.
   * Null means that period is uncapped.
   */
  weeklyRateLimit: number | null;
  yearlyRateLimit: number | null;
  /** Custom stop behavior; null in default mode (hard stop applies). */
  stopBehavior: RateLimitStopBehavior | null;
  lastAdminComment: string | null;
  weeklyExecutionCount: number;
  yearlyExecutionCount: number;
  /** Runs added by top-ups for the current week (0 when none). */
  weeklyTopupRuns: number;
  /** Runs added by weekly top-ups whose weeks overlap the current year (0 when none). */
  yearlyTopupRuns: number;
  workflowCount: number;
  membersCount: number;
  updatedAt: string | null;
  updatedByName: string | null;
};

function defaultEnrichment(): ProjectRateLimitEnrichment {
  return {
    usesDefaultLimits: true,
    weeklyRateLimit: null,
    yearlyRateLimit: null,
    stopBehavior: null,
    lastAdminComment: null,
    weeklyExecutionCount: 0,
    yearlyExecutionCount: 0,
    weeklyTopupRuns: 0,
    yearlyTopupRuns: 0,
    workflowCount: 0,
    membersCount: 0,
    updatedAt: null,
    updatedByName: null,
  };
}

/**
 * Formats a resolved user as "F. Last". Returns the fallback (the raw editor
 * email, when a user row is missing or the name is incomplete) otherwise.
 */
function formatDisplayName(
  name: { firstName: string; lastName: string } | undefined,
  fallbackEmail: string | null,
): string | null {
  if (name && name.firstName.length > 0 && name.lastName.length > 0) {
    return `${name.firstName.charAt(0)}. ${name.lastName}`;
  }
  return fallbackEmail;
}

/**
 * Manual editor runs, n8n-internal runs and evaluation runs are neither
 * counted nor blocked. Evaluation covers n8n's 'evaluation' and 'eval_manual'
 * modes. Re-checked here defensively in case a caller forgets the exemption.
 */
function isExemptMode(mode: string): boolean {
  return mode === 'manual' || mode === 'internal' || mode.startsWith('evaluation') || mode.startsWith('eval_');
}

type LimitBreach = {
  period: 'weekly' | 'yearly';
  periodKey: string;
  /** Effective limit that was enforced (base limit plus top-up runs). */
  limit: number;
  count: number;
  /** Runs added by top-ups on top of the base limit; omitted when zero. */
  topupRuns?: number;
};

/**
 * One notification trigger detected while checking a run's limits: a period
 * being reached or crossing a near-limit threshold. At most one event per
 * period per run — the highest applicable severity wins.
 */
type LimitEvent = {
  kind: RateLimitNotificationKind;
  period: 'weekly' | 'yearly';
  periodKey: string;
  /** Usage percent against the effective limit (floored integer, 100 when reached). */
  percent: number;
  limit: number;
  count: number;
  topupRuns: number;
};

/** Near-limit thresholds, highest severity first (matches the UI banner's 80%). */
const NEAR_LIMIT_THRESHOLDS = [80, 50] as const;

/**
 * Project roles that may file (and cancel) a run request: team project admins
 * and editors, plus a personal project's owner — the same membership set the
 * UI button gate uses. Slugs match n8n's `role` table; the relation's `role`
 * column stores the slug directly.
 */
const RUN_REQUEST_ROLE_SLUGS = ['project:admin', 'project:editor', 'project:personalOwner'] as const;

/**
 * Project roles that receive rate-limit emails: team project admins and
 * editors, plus a personal project's owner (its only member). Slugs match
 * n8n's `role` table; the relation's `role` column stores the slug directly.
 */
const RATE_LIMIT_NOTIFY_ROLE_SLUGS = ['project:admin', 'project:editor', 'project:personalOwner'] as const;

function formatRuns(count: number): string {
  return count.toLocaleString('en-CA');
}

function periodLabel(period: 'weekly' | 'yearly'): string {
  return period === 'weekly' ? 'weekly' : 'annual';
}

/**
 * Derives the notification events for one run's limit check: a "reached"
 * event when the count is at or over the effective limit (kind reflects the
 * enforced stop behaviour), otherwise the highest near-limit threshold the
 * count has crossed (80% before 50%). Periods without an effective limit
 * produce no events.
 */
function collectLimitEvents(params: {
  weekly: { base: number; topupRuns: number; count: number; periodKey: string } | null;
  yearly: { base: number; topupRuns: number; count: number; periodKey: string } | null;
  stopBehavior: RateLimitStopBehavior;
}): LimitEvent[] {
  const events: LimitEvent[] = [];
  for (const period of ['weekly', 'yearly'] as const) {
    const state = params[period];
    if (state === null) {
      continue;
    }
    const limit = state.base + state.topupRuns;
    const periodKey = state.periodKey;
    const topupRuns = state.topupRuns;
    const count = state.count;
    if (count >= limit) {
      events.push({
        kind: `${period}_reached_${params.stopBehavior === 'soft_stop' ? 'soft' : 'hard'}`,
        period,
        periodKey,
        percent: 100,
        limit,
        count,
        topupRuns,
      });
      continue;
    }
    for (const threshold of NEAR_LIMIT_THRESHOLDS) {
      // Integer math only: count/limit vs threshold/100 without floats.
      if (count * 100 >= limit * threshold) {
        events.push({
          kind: `${period}_near_${threshold}`,
          period,
          periodKey,
          percent: Math.floor((count * 100) / limit),
          limit,
          count,
          topupRuns,
        });
        break;
      }
    }
  }
  return events;
}

function isReachedEvent(event: LimitEvent): boolean {
  return event.kind.endsWith('_reached_soft') || event.kind.endsWith('_reached_hard');
}

function isHardStopEvent(event: LimitEvent): boolean {
  return event.kind.endsWith('_reached_hard');
}

function renderLimitEventEmail(
  event: LimitEvent,
  projectName: string,
  projectUrl: string,
): { subject: string; html: string } {
  const label = periodLabel(event.period);
  if (isReachedEvent(event)) {
    const resetDate = event.period === 'weekly' ? getNextWeeklyReset() : getNextYearlyReset();
    return {
      subject: `${projectName}: ${label} limit reached`,
      html: renderEmail('rateLimitReached', {
        projectName,
        periodLabel: label,
        used: formatRuns(event.count),
        limit: formatRuns(event.limit),
        includesTopup: event.topupRuns > 0,
        topupRuns: formatRuns(event.topupRuns),
        hardStop: isHardStopEvent(event),
        resetDate: formatPeriodDateLong(resetDate),
        projectUrl,
      }),
    };
  }
  return {
    subject: `${projectName}: ${label} limit at ${event.percent}%`,
    html: renderEmail('rateLimitNearLimit', {
      projectName,
      periodLabel: label,
      percent: String(event.percent),
      used: formatRuns(event.count),
      limit: formatRuns(event.limit),
      projectUrl,
    }),
  };
}

function describeBreach(projectId: string, breach: LimitBreach): string {
  const label = breach.period === 'weekly' ? 'Weekly' : 'Yearly';
  const limitText =
    breach.topupRuns !== undefined && breach.topupRuns > 0
      ? `${breach.limit} (base ${breach.limit - breach.topupRuns} + ${breach.topupRuns} top-up)`
      : `${breach.limit}`;
  return `${label} execution limit reached for project '${projectId}' (limit ${limitText}, used ${breach.count} in ${breach.periodKey}).`;
}

/** Per-workflow current-period usage row for a project's workflow-usage read. */
export type ProjectWorkflowUsageItem = {
  workflowId: string;
  workflowName: string;
  weeklyCount: number;
  yearlyCount: number;
};

export type ProjectWorkflowUsage = {
  projectId: string;
  weeklyPeriodKey: string;
  yearlyPeriodKey: string;
  workflows: ProjectWorkflowUsageItem[];
};

/** Serialized weekly-limit top-up row (dates as ISO strings). */
export type ProjectTopupItem = {
  id: string;
  projectId: string;
  periodKey: string;
  amount: number;
  adminComment: string;
  createdBy: string | null;
  createdAt: string;
};

export type ProjectTopupsPage = {
  data: ProjectTopupItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

function serializeTopup(row: ProjectTopup): ProjectTopupItem {
  return {
    id: row.id,
    projectId: row.projectId,
    periodKey: row.periodKey,
    amount: row.amount,
    adminComment: row.adminComment,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The project's pending run request, as surfaced on the project detail payload. */
export type PendingRunRequestSummary = {
  id: string;
  requestKind: RunRequestKind;
  extraRuns: number | null;
  periodKey: string | null;
  requestedWeeklyLimit: number | null;
  requestedAnnualLimit: number | null;
  reason: string;
  /** n8n user id of the requester; the UI renders "by you" for a match. */
  requestedBy: string;
  createdAt: string;
};

function serializeRunRequest(row: {
  id: string;
  requestKind: string;
  extraRuns: number | null;
  periodKey: string | null;
  requestedWeeklyLimit: number | null;
  requestedAnnualLimit: number | null;
  reason: string;
  requestedBy: string;
  createdAt: Date;
}): PendingRunRequestSummary {
  return {
    id: row.id,
    requestKind: row.requestKind as RunRequestKind,
    extraRuns: row.extraRuns,
    periodKey: row.periodKey,
    requestedWeeklyLimit: row.requestedWeeklyLimit,
    requestedAnnualLimit: row.requestedAnnualLimit,
    reason: row.reason,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** True for a PostgreSQL unique-violation error (used for the pending-per-project race). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

// -------------------------------------------------------------------------
// Admin review of run requests (types + enrichment helpers)
// -------------------------------------------------------------------------

/** Status filter values for the admin run-requests list ('denied' maps to the DB's 'rejected'). */
export type AdminRunRequestStatusFilter = 'pending' | 'approved' | 'denied' | 'cancelled' | 'all';

/**
 * Admin list row: a run request enriched with project, requester, usage and
 * decision context. `status` is the UI-facing value (DB 'rejected' surfaces
 * as 'denied').
 */
export type AdminRunRequestItem = {
  id: string;
  projectId: string;
  projectName: string;
  projectType: string;
  requestKind: RunRequestKind;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  extraRuns: number | null;
  periodKey: string | null;
  requestedWeeklyLimit: number | null;
  requestedAnnualLimit: number | null;
  reason: string;
  requestedBy: string;
  /** "Jordan Lee" (falls back to the requester's email). */
  requestedByName: string | null;
  requestedByEmail: string | null;
  /** Requester's project-role label, e.g. 'Editor'. */
  requestedByRoleLabel: string | null;
  createdAt: string;
  /** Usage in the week/year the request was sent (the list's "week used" column). */
  weeklyUsedWhenSent: number | null;
  yearlyUsedWhenSent: number | null;
  /** Usage in the current week/year (the review dialog's "now" figure). */
  weeklyUsedNow: number;
  yearlyUsedNow: number;
  /** Limits in force right now (defaults mode resolves the scope defaults). */
  currentWeeklyLimit: number | null;
  currentAnnualLimit: number | null;
  /** Most recent top-up before review, for context in the dialog. */
  lastTopup: { amount: number; periodKey: string; createdAt: string; createdByName: string | null } | null;
  /** Most recent limits change before review, for context in the dialog. */
  lastLimitChange: { at: string; byName: string | null } | null;
  grantedRuns: number | null;
  decidedWeeklyLimit: number | null;
  decidedAnnualLimit: number | null;
  /** The admin's note on approval, or the deny reason. */
  decisionNote: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
};

export type AdminRunRequestsPage = {
  data: AdminRunRequestItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  /** Drives the "Run requests waiting" stat tile. */
  pending: { count: number; oldestCreatedAt: string | null };
};

/** n8n user entity with the identity fields the enrichment reads. */
type RunRequestUserEntity = {
  id: string;
  role: { slug: string };
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

/** Role labels shown next to the requester's name ("From Jordan Lee (Editor)"). */
const RUN_REQUEST_ROLE_LABELS: Record<string, string> = {
  'project:admin': 'Admin',
  'project:editor': 'Editor',
  'project:personalOwner': 'Owner',
};

/**
 * Full-name formatter for the admin surfaces (the member-side view uses the
 * initials style via formatDisplayName; these mocks show full names).
 */
function formatFullName(
  name: { firstName?: string | null; lastName?: string | null } | undefined,
  fallbackEmail: string | null,
): string | null {
  const first = name?.firstName?.trim() ?? '';
  const last = name?.lastName?.trim() ?? '';
  if (first.length > 0 && last.length > 0) {
    return `${first} ${last}`;
  }
  if (first.length > 0) {
    return first;
  }
  return fallbackEmail;
}

function serializeDecisionFields(
  row: RateLimitRequest,
): Pick<
  AdminRunRequestItem,
  'grantedRuns' | 'decidedWeeklyLimit' | 'decidedAnnualLimit' | 'decisionNote' | 'decidedBy' | 'decidedAt'
> {
  return {
    grantedRuns: row.grantedRuns,
    decidedWeeklyLimit: row.decidedWeeklyLimit,
    decidedAnnualLimit: row.decidedAnnualLimit,
    decisionNote: row.decisionNote,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

/** Default limits for one project scope; a null limit means "no default" (uncapped). */
export type RateLimitScopeDefaults = {
  weeklyRateLimit: number | null;
  yearlyRateLimit: number | null;
};

/** Saved per-scope defaults, keyed by project kind. */
export type ProjectRateLimitDefaults = {
  team: RateLimitScopeDefaults;
  personal: RateLimitScopeDefaults;
};

function serializeScopeDefaults(row: ProjectRateLimitDefault | null): RateLimitScopeDefaults {
  return {
    weeklyRateLimit: row?.weeklyRateLimit ?? null,
    yearlyRateLimit: row?.yearlyRateLimit ?? null,
  };
}

export class ProjectRateLimitService {
  constructor(
    private readonly n8nRepositories: N8nRepositories,
    private readonly customRepositories: CustomRepositories,
    /**
     * Optional mailer for rate-limit notifications. Null (the default)
     * disables notifications without affecting enforcement — the contract
     * `AccessRequestService` uses for its optional mailer as well.
     */
    private readonly nodeMailerService: NodeMailerService | null = null,
  ) {}

  /**
   * Enforces per-project execution rate limits for a workflow run and, when
   * allowed, counts the usage against the current weekly/yearly periods.
   *
   * - Check-then-increment: a hard-stop breach throws before any increment
   *   (rejected runs are not counted).
   * - Always-count: unlimited/unconfigured projects still accumulate usage so
   *   the admin UI shows usage for all projects.
   * - Fail-open: any infrastructure error is logged and the execution is
   *   allowed; only RateLimitExceededError propagates.
   */
  async enforceExecution(params: { workflowId: string; mode: string; countUsage: boolean }): Promise<void> {
    const { workflowId, mode, countUsage } = params;

    if (isExemptMode(mode)) {
      return;
    }

    try {
      const projectIds = await this.n8nRepositories.sharedWorkflow.findProjectIds(workflowId);
      if (projectIds.length === 0) {
        log.debug('Workflow is not shared with any project; skipping rate limiting', { workflowId, mode });
        return;
      }
      if (projectIds.length > 1) {
        log.warn('Workflow shared with multiple projects; rate limiting against the first', {
          workflowId,
          projectIds,
        });
      }
      const projectId = projectIds[0];

      const config = await this.customRepositories.projectRateLimit.get(projectId);
      const periodKeys = getCurrentPeriodKeys();
      const counts = await this.customRepositories.projectExecutionUsage.getCounts(
        projectId,
        periodKeys.weekly,
        periodKeys.yearly,
      );

      // Effective base limits. Default mode (the flag's default, also for
      // unconfigured projects) ignores the row's own values entirely and
      // follows the scope's saved defaults (team/personal). Custom mode
      // resolves the project's own configuration first, then its scope's
      // saved defaults per unset period. A scope with no defaults stays
      // uncapped for that period. The project-kind lookup runs only when a
      // scope default can matter, keeping fully custom-configured projects
      // at the same query count as before.
      const useDefaults = config?.usesDefaultLimits ?? true;
      let weeklyBase = !useDefaults ? (config?.weeklyRateLimit ?? null) : null;
      let yearlyBase = !useDefaults ? (config?.yearlyRateLimit ?? null) : null;
      if (weeklyBase === null || yearlyBase === null) {
        const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
        const kind = project?.type === 'personal' ? 'personal' : 'team';
        const defaults = await this.customRepositories.projectRateLimitDefault.get(kind);
        weeklyBase = weeklyBase ?? defaults?.weeklyRateLimit ?? null;
        yearlyBase = yearlyBase ?? defaults?.yearlyRateLimit ?? null;
      }

      // Top-ups raise the effective weekly limit whenever a weekly base is
      // enforced, whether it comes from the project's own configuration or a
      // scope default. Every counted run also accrues to the calendar-year
      // counter, so the sum of all weekly top-ups whose weeks overlap the
      // current year raises the yearly limit by the same amount — otherwise
      // the yearly gate could block runs the top-up-boosted weekly gate
      // allowed.
      let weeklyTopupRuns = 0;
      let yearlyTopupRuns = 0;
      if (weeklyBase !== null || yearlyBase !== null) {
        const [weeklySums, yearlySums] = await Promise.all([
          weeklyBase !== null
            ? this.customRepositories.projectTopup.sumByProjectIds([projectId], periodKeys.weekly)
            : Promise.resolve(new Map<string, number>()),
          yearlyBase !== null
            ? this.customRepositories.projectTopup.sumByProjectIdsInWeeklyKeys(
                [projectId],
                listWeeklyPeriodKeysOverlappingYearlyPeriod(periodKeys.yearly),
              )
            : Promise.resolve(new Map<string, number>()),
        ]);
        weeklyTopupRuns = weeklySums.get(projectId) ?? 0;
        yearlyTopupRuns = yearlySums.get(projectId) ?? 0;
      }

      const stopBehavior: RateLimitStopBehavior =
        !useDefaults && config?.stopBehavior === 'soft_stop' ? 'soft_stop' : 'hard_stop';
      const limitEvents = collectLimitEvents({
        weekly:
          weeklyBase === null
            ? null
            : { base: weeklyBase, topupRuns: weeklyTopupRuns, count: counts.weeklyCount, periodKey: periodKeys.weekly },
        yearly:
          yearlyBase === null
            ? null
            : {
                base: yearlyBase,
                topupRuns: yearlyTopupRuns,
                count: counts.yearlyCount,
                periodKey: periodKeys.yearly,
              },
        stopBehavior,
      });

      const breaches: LimitBreach[] = limitEvents.filter(isReachedEvent).map((event) => ({
        period: event.period,
        periodKey: event.periodKey,
        limit: event.limit,
        count: event.count,
        topupRuns: event.topupRuns > 0 ? event.topupRuns : undefined,
      }));

      if (limitEvents.length > 0) {
        // Fire-and-forget: spawned before a hard-stop throw so a rejected
        // run still triggers its one-time notification.
        this.notifyLimitEvents(projectId, limitEvents);
      }

      if (breaches.length > 0) {
        if (stopBehavior === 'soft_stop') {
          for (const breach of breaches) {
            log.warn(`${describeBreach(projectId, breach)} Soft stop configured — execution continues`, {
              projectId,
              workflowId,
              period: breach.period,
              periodKey: breach.periodKey,
              limit: breach.limit,
              count: breach.count,
              stopBehavior: 'soft_stop',
            });
          }
        } else {
          const breach = breaches[0];
          throw new RateLimitExceededError(
            `${describeBreach(projectId, breach)} Execution rejected; contact the platform team to adjust rate limits.`,
          );
        }
      }

      if (countUsage) {
        await this.customRepositories.projectExecutionUsage.increment(projectId, 'weekly', periodKeys.weekly);
        await this.customRepositories.projectExecutionUsage.increment(projectId, 'yearly', periodKeys.yearly);
        await this.customRepositories.workflowExecutionUsage.increment(
          projectId,
          workflowId,
          'weekly',
          periodKeys.weekly,
        );
        await this.customRepositories.workflowExecutionUsage.increment(
          projectId,
          workflowId,
          'yearly',
          periodKeys.yearly,
        );
      }
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        throw error;
      }
      log.error('Rate limit enforcement failed — failing open', {
        workflowId,
        mode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Email notifications (fire-and-forget; failures logged, never thrown)
  // -------------------------------------------------------------------------

  private async resolveProjectContext(
    projectId: string,
  ): Promise<{ projectName: string; projectType: string; projectUrl: string } | null> {
    const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
    if (!project) {
      return null;
    }
    return {
      projectName: project.name,
      projectType: project.type,
      projectUrl: `${UI_APP_BASE_URL}/projects/${projectId}`,
    };
  }

  /** Resolves the project's admin/editor email addresses (the notification recipients). */
  private async resolveProjectRecipientEmails(projectId: string): Promise<string[]> {
    const emailsByProject = await this.n8nRepositories.projectRelation.listMemberEmailsByProjectIdsAndRoles(
      [projectId],
      [...RATE_LIMIT_NOTIFY_ROLE_SLUGS],
    );
    return emailsByProject.get(projectId) ?? [];
  }

  /**
   * Spawns the notification dispatch for the given enforcement-time events.
   * Deliberately not awaited by enforcement: SMTP latency must never delay
   * (or fail) a workflow run, and a rejected run still gets its notification
   * because the spawn happens before the hard-stop throw.
   */
  private notifyLimitEvents(projectId: string, events: LimitEvent[]): void {
    if (!this.nodeMailerService || events.length === 0) {
      return;
    }
    void this.dispatchLimitNotifications(projectId, events).catch((error) => {
      log.error('Rate-limit notification dispatch failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async dispatchLimitNotifications(projectId: string, events: LimitEvent[]): Promise<void> {
    try {
      // Send-once semantics: the first claim wins; concurrent runs (in any
      // process) that find the claim already present stay silent.
      const claimed: LimitEvent[] = [];
      for (const event of events) {
        const won = await this.customRepositories.rateLimitNotification.claim({
          projectId,
          periodKey: event.periodKey,
          eventKind: event.kind,
          usageCount: event.count,
        });
        if (won) {
          claimed.push(event);
        }
      }
      if (claimed.length === 0) {
        log.debug('Rate-limit notifications already sent for these periods; skipping', { projectId });
        return;
      }

      const context = await this.resolveProjectContext(projectId);
      if (!context) {
        log.warn('Project not found when sending rate-limit notifications', { projectId });
        return;
      }

      const recipients = new Set<string>(await this.resolveProjectRecipientEmails(projectId));
      // Hard-stop reached events are incidents platform admins should see too.
      if (claimed.some(isHardStopEvent)) {
        for (const email of await this.n8nRepositories.user.findAdminEmails()) {
          recipients.add(email);
        }
      }
      if (recipients.size === 0) {
        log.warn('No rate-limit notification recipients resolved', {
          projectId,
          kinds: claimed.map((event) => event.kind),
        });
        return;
      }

      for (const event of claimed) {
        const { subject, html } = renderLimitEventEmail(event, context.projectName, context.projectUrl);
        await Promise.all([...recipients].map((to) => this.nodeMailerService!.sendMail({ to, subject, html })));
      }
      log.info('Sent rate-limit notification emails', {
        projectId,
        kinds: claimed.map((event) => event.kind),
        recipientCount: recipients.size,
      });
    } catch (error) {
      log.error('Failed to send rate-limit notification emails', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Spawns a config-change notification (top-up granted, limits changed) for
   * the project's admins and editors. Fire-and-forget like enforcement-time
   * notifications; `reason` only labels log lines.
   */
  private notifyConfigEvent(
    projectId: string,
    render: (context: { projectName: string; projectType: string; projectUrl: string }) => Promise<{
      subject: string;
      html: string;
    }>,
    reason: string,
  ): void {
    if (!this.nodeMailerService) {
      return;
    }
    void (async () => {
      try {
        const context = await this.resolveProjectContext(projectId);
        if (!context) {
          log.warn(`Project not found when sending the ${reason} email`, { projectId });
          return;
        }
        const emails = await this.resolveProjectRecipientEmails(projectId);
        if (emails.length === 0) {
          log.warn(`No recipients resolved for the ${reason} email`, { projectId });
          return;
        }
        const { subject, html } = await render(context);
        await Promise.all(emails.map((to) => this.nodeMailerService!.sendMail({ to, subject, html })));
        log.info(`Sent the ${reason} email`, { projectId, recipientCount: emails.length });
      } catch (error) {
        log.error(`Failed to send the ${reason} email`, {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }

  private notifyTopupGranted(projectId: string, topup: ProjectTopup): void {
    this.notifyConfigEvent(
      projectId,
      ({ projectName, projectUrl }) =>
        Promise.resolve({
          subject: `Extra runs added for ${projectName}`,
          html: renderEmail('rateLimitTopupGranted', {
            projectName,
            amount: formatRuns(topup.amount),
            weekDescription: describeWeeklyPeriodKey(topup.periodKey) ?? topup.periodKey,
            projectUrl,
          }),
        }),
      'top-up granted',
    );
  }

  private notifyLimitsChanged(projectId: string, stored: ProjectRateLimit): void {
    this.notifyConfigEvent(
      projectId,
      async ({ projectName, projectType, projectUrl }) => {
        // The email shows the limits that will actually be enforced: scope
        // defaults in default mode, custom values (with per-period defaults
        // fallback) in custom mode — resolved exactly like enforcement.
        const kind = projectType === 'personal' ? 'personal' : 'team';
        const defaults = await this.customRepositories.projectRateLimitDefault.get(kind);
        const effectiveWeekly = stored.usesDefaultLimits
          ? (defaults?.weeklyRateLimit ?? null)
          : (stored.weeklyRateLimit ?? defaults?.weeklyRateLimit ?? null);
        const effectiveYearly = stored.usesDefaultLimits
          ? (defaults?.yearlyRateLimit ?? null)
          : (stored.yearlyRateLimit ?? defaults?.yearlyRateLimit ?? null);
        const limitText = (value: number | null): string => (value === null ? 'No limit' : `${formatRuns(value)} runs`);
        return {
          subject: `Execution limits updated for ${projectName}`,
          html: renderEmail('rateLimitLimitsChanged', {
            projectName,
            weeklyLimit: limitText(effectiveWeekly),
            yearlyLimit: limitText(effectiveYearly),
            changedBy: stored.updatedBy,
            projectUrl,
          }),
        };
      },
      'limits-changed',
    );
  }

  /**
   * Replaces the rate-limit configuration for a project (full-replace semantics).
   * With `usesDefaultLimits` the project follows its scope's saved defaults:
   * the row is normalized to the unconfigured shape (null limits, hard stop) so
   * stored values always mirror what enforcement uses in custom mode; the
   * admin comment is kept as the audit trail. Custom mode stores the given
   * values. `updatedBy` records the acting admin's email (trimmed; an empty
   * value is stored as null — display names are resolved at read time).
   * Throws AppError 404 when the project does not exist in n8n.
   */
  async updateRateLimit(
    projectId: string,
    body: {
      usesDefaultLimits: boolean;
      weeklyRateLimit: number | null;
      yearlyRateLimit: number | null;
      lastAdminComment: string | null;
      stopBehavior: RateLimitStopBehavior;
    },
    updatedBy: string | null,
  ): Promise<ProjectRateLimit> {
    await this.assertProjectExists(projectId);

    const normalized = body.usesDefaultLimits
      ? {
          usesDefaultLimits: true,
          weeklyRateLimit: null,
          yearlyRateLimit: null,
          lastAdminComment: body.lastAdminComment,
          stopBehavior: 'hard_stop' as const,
        }
      : { ...body, usesDefaultLimits: false };

    const trimmedUpdatedBy = updatedBy !== null && updatedBy.trim().length > 0 ? updatedBy.trim() : null;
    await this.customRepositories.projectRateLimit.upsert({ projectId, ...normalized, updatedBy: trimmedUpdatedBy });

    const stored = await this.customRepositories.projectRateLimit.get(projectId);
    if (!stored) {
      throw new AppError(500, 'Failed to read the stored rate limit');
    }
    this.notifyLimitsChanged(projectId, stored);
    return stored;
  }

  /**
   * Returns the saved per-scope default limits. A missing row or null limit
   * means "no default" — projects of that scope without their own limits stay
   * uncapped. The response intentionally contains no usage counts; the
   * defaults dialog needs only the saved values.
   */
  async getRateLimitDefaults(): Promise<ProjectRateLimitDefaults> {
    const rows = await this.customRepositories.projectRateLimitDefault.getAll();
    const byKind = new Map(rows.map((row) => [row.projectKind, row]));
    return {
      team: serializeScopeDefaults(byKind.get('team') ?? null),
      personal: serializeScopeDefaults(byKind.get('personal') ?? null),
    };
  }

  /**
   * Replaces the per-scope default limits (full-replace semantics; both scopes
   * are written atomically). `updatedBy` records the acting admin's email
   * (trimmed; an empty value is stored as null).
   */
  async updateRateLimitDefaults(
    body: { team: RateLimitScopeDefaults; personal: RateLimitScopeDefaults },
    updatedBy: string | null,
  ): Promise<ProjectRateLimitDefaults> {
    const trimmedUpdatedBy = updatedBy !== null && updatedBy.trim().length > 0 ? updatedBy.trim() : null;
    await this.customRepositories.projectRateLimitDefault.upsertBoth({
      team: { ...body.team },
      personal: { ...body.personal },
      updatedBy: trimmedUpdatedBy,
    });
    return {
      team: { ...body.team },
      personal: { ...body.personal },
    };
  }

  /**
   * Batch-fetches rate-limit configuration, current-period usage and workflow
   * counts for the given projects (one query per source, no per-item loops)
   * and returns the enrichment keyed by projectId. Limits are resolved exactly
   * as enforcement resolves them: default-mode (or unconfigured) projects get
   * their scope's saved limits, custom-mode projects their own values with
   * scope defaults per unset period — so the UI can show the limits that are
   * actually enforced, plus the mode that produced them. Unconfigured projects
   * get null limits/comment and zero counts.
   *
   * Never throws: on any error the default enrichment is returned so the
   * project list keeps working during custom-DB outages.
   */
  async enrichProjectsWithRateLimits(
    items: Array<{ projectId: string; projectType: string }>,
  ): Promise<Record<string, ProjectRateLimitEnrichment>> {
    const projectIds = items.map((item) => item.projectId);
    const enrichment: Record<string, ProjectRateLimitEnrichment> = {};
    for (const item of items) {
      enrichment[item.projectId] = defaultEnrichment();
    }
    if (projectIds.length === 0) {
      return enrichment;
    }

    try {
      const periodKeys = getCurrentPeriodKeys();
      const yearOverlapKeys = listWeeklyPeriodKeysOverlappingYearlyPeriod(periodKeys.yearly);
      const [rateLimitMap, usageMap, workflowCountMap, memberCountMap, topupMap, yearlyTopupMap, defaultsRows] =
        await Promise.all([
          this.customRepositories.projectRateLimit.listByProjectIds(projectIds),
          this.customRepositories.projectExecutionUsage.listCountsByProjectIds(
            projectIds,
            periodKeys.weekly,
            periodKeys.yearly,
          ),
          this.n8nRepositories.sharedWorkflow.countByProjectIds(projectIds),
          this.n8nRepositories.projectRelation.countMembersByProjectIds(projectIds),
          this.customRepositories.projectTopup.sumByProjectIds(projectIds, periodKeys.weekly),
          this.customRepositories.projectTopup.sumByProjectIdsInWeeklyKeys(projectIds, yearOverlapKeys),
          this.customRepositories.projectRateLimitDefault.getAll(),
        ]);
      const defaultsByKind = new Map(defaultsRows.map((row) => [row.projectKind, row]));

      // A failed name lookup must not discard the enrichment it accompanies,
      // so resolution degrades to its own catch (updatedByName → null) instead
      // of joining the outer fail-all catch below.
      const editorEmails = [
        ...new Set(
          projectIds
            .map((projectId) => rateLimitMap.get(projectId)?.updatedBy)
            .filter((email): email is string => typeof email === 'string' && email.trim().length > 0)
            .map((email) => email.trim()),
        ),
      ];
      let nameMap: Map<string, { firstName: string; lastName: string }> | null;
      try {
        nameMap = await this.n8nRepositories.user.findUserNamesByEmails(editorEmails);
      } catch (error) {
        log.error('Failed to resolve rate-limit editor display names; falling back to emails', {
          error: error instanceof Error ? error.message : String(error),
        });
        nameMap = null;
      }

      for (const item of items) {
        const projectId = item.projectId;
        const config = rateLimitMap.get(projectId);
        const usage = usageMap.get(projectId);
        const workflowCount = workflowCountMap.get(projectId);
        const memberCount = memberCountMap.get(projectId);
        const editorEmail =
          config?.updatedBy != null && config.updatedBy.trim().length > 0 ? config.updatedBy.trim() : null;
        const editorName = nameMap?.get(editorEmail?.toLowerCase() ?? '');
        const useDefaults = config?.usesDefaultLimits ?? true;
        const kind = item.projectType === 'personal' ? 'personal' : 'team';
        const defaults = defaultsByKind.get(kind) ?? null;
        enrichment[projectId] = {
          usesDefaultLimits: useDefaults,
          weeklyRateLimit: useDefaults
            ? (defaults?.weeklyRateLimit ?? null)
            : (config?.weeklyRateLimit ?? defaults?.weeklyRateLimit ?? null),
          yearlyRateLimit: useDefaults
            ? (defaults?.yearlyRateLimit ?? null)
            : (config?.yearlyRateLimit ?? defaults?.yearlyRateLimit ?? null),
          stopBehavior:
            !useDefaults && config ? ((config.stopBehavior as RateLimitStopBehavior | undefined) ?? null) : null,
          lastAdminComment: config?.lastAdminComment ?? null,
          weeklyExecutionCount: usage?.weeklyCount ?? 0,
          yearlyExecutionCount: usage?.yearlyCount ?? 0,
          weeklyTopupRuns: topupMap.get(projectId) ?? 0,
          yearlyTopupRuns: yearlyTopupMap.get(projectId) ?? 0,
          workflowCount: workflowCount ?? 0,
          membersCount: memberCount ?? 0,
          updatedAt: config?.updatedAt ? config.updatedAt.toISOString() : null,
          updatedByName: nameMap ? formatDisplayName(editorName, editorEmail) : null,
        };
      }
    } catch (error) {
      log.error('Failed to enrich admin projects with rate-limit data; returning defaults', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return enrichment;
  }

  /**
   * Returns the current-period per-workflow execution usage for a project.
   * Workflows come from n8n's shared-workflow table; usage rows for workflows
   * no longer in the project are excluded. Sorted by workflow name ascending.
   * Throws AppError 404 when the project does not exist in n8n.
   */
  async getProjectWorkflowUsage(projectId: string): Promise<ProjectWorkflowUsage> {
    await this.assertProjectExists(projectId);

    const workflowRows = await this.n8nRepositories.sharedWorkflow.findWorkflowRowsByProjectIds([projectId]);
    const periodKeys = getCurrentPeriodKeys();
    const counts = await this.customRepositories.workflowExecutionUsage.listCountsByWorkflowIds(
      projectId,
      workflowRows.map((row) => row.workflowId),
      periodKeys.weekly,
      periodKeys.yearly,
    );

    const workflows = workflowRows
      .map((row) => ({
        workflowId: row.workflowId,
        workflowName: row.workflowName,
        weeklyCount: counts.get(row.workflowId)?.weeklyCount ?? 0,
        yearlyCount: counts.get(row.workflowId)?.yearlyCount ?? 0,
      }))
      .sort((a, b) => a.workflowName.localeCompare(b.workflowName));

    return {
      projectId,
      weeklyPeriodKey: periodKeys.weekly,
      yearlyPeriodKey: periodKeys.yearly,
      workflows,
    };
  }

  /**
   * Lists a project's top-ups, most recent period first. Throws AppError 404
   * when the project does not exist in n8n.
   */
  async listProjectTopups(projectId: string, page: number, pageSize: number): Promise<ProjectTopupsPage> {
    await this.assertProjectExists(projectId);

    const { rows, totalItems } = await this.customRepositories.projectTopup.list(projectId, page, pageSize);
    return {
      data: rows.map(serializeTopup),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
    };
  }

  /**
   * Adds a one-off top-up to a project's weekly limit for a target week.
   * The period key must be the current week or one of the following weeks
   * within the top-up horizon (validated against the live key list, so ISO
   * year rollovers are handled); the amount must be a whole number within
   * bounds. Throws AppError 404 for unknown projects and 400 for invalid
   * input. Re-validates route-level zod input for direct callers.
   */
  async createProjectTopup(
    projectId: string,
    body: { periodKey: string; amount: number; adminComment: string },
    createdBy: string | null,
  ): Promise<ProjectTopup> {
    await this.assertProjectExists(projectId);

    if (!WEEKLY_KEY_PATTERN.test(body.periodKey)) {
      throw new AppError(400, 'periodKey must match the weekly format YYYY-Www');
    }
    if (!listUpcomingWeeklyPeriodKeys(MAX_TOPUP_HORIZON_WEEKS).includes(body.periodKey)) {
      throw new AppError(400, 'periodKey must be the current week or a coming week within the top-up horizon');
    }
    if (!Number.isInteger(body.amount) || body.amount < 1 || body.amount > MAX_TOPUP_AMOUNT) {
      throw new AppError(400, `amount must be a whole number between 1 and ${MAX_TOPUP_AMOUNT}`);
    }

    const trimmedCreatedBy = createdBy !== null && createdBy.trim().length > 0 ? createdBy.trim() : null;
    const created = await this.customRepositories.projectTopup.create({
      projectId,
      periodKey: body.periodKey,
      amount: body.amount,
      adminComment: body.adminComment.trim(),
      createdBy: trimmedCreatedBy,
    });
    this.notifyTopupGranted(projectId, created);
    return created;
  }

  /**
   * Deletes a top-up row. Only top-ups whose target week has not started are
   * deletable (the key must sort after the current weekly key; both keys are
   * zero-padded so lexicographic order matches calendar order).
   * Throws AppError 404 for unknown projects/rows and 409 for started weeks.
   */
  async deleteProjectTopup(projectId: string, topupId: string): Promise<void> {
    await this.assertProjectExists(projectId);

    const row = await this.customRepositories.projectTopup.getById(projectId, topupId);
    if (!row) {
      throw new AppError(404, 'Top-up not found');
    }

    const { weekly } = getCurrentPeriodKeys();
    if (row.periodKey <= weekly) {
      throw new AppError(409, 'Top-ups for the current or past weeks cannot be deleted');
    }

    await this.customRepositories.projectTopup.deleteById(topupId);
  }

  /**
   * Returns the project's pending run request for the detail payload, or null
   * when none is open. Fail-open: an unreadable table must not take the whole
   * project detail endpoint down, so errors log and render no review panel.
   */
  async getPendingRunRequest(projectId: string): Promise<PendingRunRequestSummary | null> {
    try {
      const row = await this.customRepositories.rateLimitRequest.getPendingByProjectId(projectId);
      return row ? serializeRunRequest(row) : null;
    } catch (error) {
      log.error('Failed to read the pending run request; rendering the detail page without it', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Files a member "Request more runs" submission. Membership-gated exactly
   * like the UI button: team project admins/editors and personal owners may
   * file; a platform admin without a project relation may not. One pending
   * request per project — a concurrent or duplicate submit fails with 409.
   * Throws AppError 404 (unknown project), 403 (not eligible), 400 (invalid
   * kind/field coherence, bounds, or week horizon) and 409 (pending exists).
   */
  async createRunRequest(
    projectId: string,
    userId: string,
    body: {
      requestKind: RunRequestKind;
      extraRuns?: number | null;
      periodKey?: string | null;
      requestedWeeklyLimit?: number | null;
      requestedAnnualLimit?: number | null;
      reason: string;
    },
  ): Promise<PendingRunRequestSummary> {
    const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
    if (!project) {
      throw new AppError(404, 'Project not found');
    }
    if (userId.trim() === '') {
      throw new AppError(403, 'Only project admins, editors and personal owners can request more runs');
    }
    const viewerRole = await getViewerProjectRole(
      this.n8nRepositories.project,
      this.n8nRepositories.projectRelation,
      userId,
      projectId,
    );
    if (viewerRole === null || !(RUN_REQUEST_ROLE_SLUGS as readonly string[]).includes(viewerRole)) {
      throw new AppError(403, 'Only project admins, editors and personal owners can request more runs');
    }

    const kind = body.requestKind;
    const extraRuns = body.extraRuns ?? null;
    const periodKey = body.periodKey ?? null;
    const requestedWeeklyLimit = body.requestedWeeklyLimit ?? null;
    const requestedAnnualLimit = body.requestedAnnualLimit ?? null;
    const reason = body.reason.trim();

    if (kind === 'extra_runs') {
      if (
        extraRuns === null ||
        !Number.isInteger(extraRuns) ||
        extraRuns < RUN_REQUEST_MIN_EXTRA_RUNS ||
        extraRuns > RUN_REQUEST_MAX_EXTRA_RUNS
      ) {
        throw new AppError(
          400,
          `extraRuns must be a whole number between ${RUN_REQUEST_MIN_EXTRA_RUNS} and ${RUN_REQUEST_MAX_EXTRA_RUNS}`,
        );
      }
      if (
        periodKey === null ||
        !WEEKLY_KEY_PATTERN.test(periodKey) ||
        !listUpcomingWeeklyPeriodKeys(MAX_RUN_REQUEST_HORIZON_WEEKS).includes(periodKey)
      ) {
        throw new AppError(400, 'periodKey must be the current week or one of the coming 8 weeks');
      }
      if (requestedWeeklyLimit !== null || requestedAnnualLimit !== null) {
        throw new AppError(400, 'Limit changes belong to the limit_increase request kind');
      }
    } else {
      if (extraRuns !== null || periodKey !== null) {
        throw new AppError(400, 'extraRuns and periodKey belong to the extra_runs request kind');
      }
      if (requestedWeeklyLimit === null && requestedAnnualLimit === null) {
        throw new AppError(400, 'Propose at least one of requestedWeeklyLimit or requestedAnnualLimit');
      }
      if (requestedWeeklyLimit !== null && requestedAnnualLimit !== null && requestedAnnualLimit < requestedWeeklyLimit) {
        throw new AppError(400, 'requestedAnnualLimit must be at least the requestedWeeklyLimit');
      }
    }

    const pending = await this.customRepositories.rateLimitRequest.getPendingByProjectId(projectId);
    if (pending) {
      throw new AppError(409, 'This project already has a request waiting for review');
    }
    try {
      const created = await this.customRepositories.rateLimitRequest.create({
        projectId,
        requestKind: kind,
        extraRuns,
        periodKey,
        requestedWeeklyLimit,
        requestedAnnualLimit,
        reason,
        requestedBy: userId,
      });
      return serializeRunRequest(created);
    } catch (error) {
      // The partial unique index is the race-safe guard: a concurrent submit
      // may have won between the pre-check and this insert.
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'This project already has a request waiting for review');
      }
      throw error;
    }
  }

  /**
   * Cancels the requester's own pending run request. Throws AppError 404 for
   * unknown projects and for requests that are missing, already decided, or
   * filed by someone else (those are indistinguishable to the requester).
   */
  async cancelRunRequest(projectId: string, requestId: string, userId: string): Promise<void> {
    await this.assertProjectExists(projectId);
    const cancelled = await this.customRepositories.rateLimitRequest.cancelPending(requestId, projectId, userId);
    if (!cancelled) {
      throw new AppError(404, 'Pending request not found');
    }
  }

  // -------------------------------------------------------------------------
  // Admin review of run requests (list + approve/deny)
  // -------------------------------------------------------------------------

  /**
   * Lists run requests for the admin review page, enriched per row. Pending
   * requests sort oldest-first (review-queue order); every other status — and
   * the 'all' filter — sorts newest-first. Search matches project name or the
   * requester's name/email. The pending counts are returned regardless of the
   * filter so the stat tile stays live.
   */
  async listRunRequestsForAdmin(query: {
    status: AdminRunRequestStatusFilter;
    search?: string | null;
    page: number;
    pageSize: number;
  }): Promise<AdminRunRequestsPage> {
    const dbStatuses: RunRequestStatus[] =
      query.status === 'all'
        ? ['pending', 'approved', 'rejected', 'cancelled']
        : query.status === 'denied'
          ? ['rejected']
          : [query.status];
    const [rows, pendingRows] = await Promise.all([
      this.customRepositories.rateLimitRequest.listByStatuses(dbStatuses),
      this.customRepositories.rateLimitRequest.listByStatuses(['pending']),
    ]);

    // Pending keeps the queue's oldest-first order; everything else is newest-first.
    if (query.status !== 'pending') {
      rows.sort((a, b) => {
        const byDate = b.createdAt.getTime() - a.createdAt.getTime();
        return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
      });
    }

    const items = await this.enrichRunRequests(rows);
    const search = query.search?.trim().toLowerCase() ?? '';
    const filtered =
      search.length > 0
        ? items.filter(
            (item) =>
              item.projectName.toLowerCase().includes(search) ||
              (item.requestedByName ?? '').toLowerCase().includes(search) ||
              (item.requestedByEmail ?? '').toLowerCase().includes(search),
          )
        : items;

    const page = Math.max(1, Math.floor(query.page));
    const pageSize = Math.max(1, Math.floor(query.pageSize));
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const start = (page - 1) * pageSize;

    const oldestPending = pendingRows.reduce<Date | null>(
      (oldest, row) => (oldest === null || row.createdAt < oldest ? row.createdAt : oldest),
      null,
    );

    return {
      data: filtered.slice(start, start + pageSize),
      pagination: { page, pageSize, totalItems, totalPages },
      pending: {
        count: pendingRows.length,
        oldestCreatedAt: oldestPending ? oldestPending.toISOString() : null,
      },
    };
  }

  /**
   * Approves a pending run request and fulfills it atomically: extra-runs
   * requests become a top-up for the asked week, limit-raise requests become a
   * custom limits configuration (full-replace semantics like Edit limits).
   * The reviewing admin may grant less than asked, never more. Throws AppError
   * 404 (unknown request), 409 (cancelled or already decided) and 400
   * (validation).
   */
  async approveRunRequest(
    requestId: string,
    body: {
      grantedRuns?: number | null;
      newWeeklyLimit?: number | null;
      newAnnualLimit?: number | null;
      note?: string | null;
    },
    decidedBy: string | null,
  ): Promise<AdminRunRequestItem> {
    const row = await this.customRepositories.rateLimitRequest.getById(requestId);
    if (!row) {
      throw new AppError(404, 'Request not found');
    }
    if (row.status !== 'pending') {
      throw await this.requestGoneError(row);
    }
    const note = body.note?.trim() ? body.note!.trim() : null;

    if (row.requestKind === 'extra_runs') {
      const asked = row.extraRuns ?? 0;
      const granted = body.grantedRuns ?? asked;
      if (
        !Number.isInteger(granted) ||
        granted < RUN_REQUEST_MIN_EXTRA_RUNS ||
        granted > asked ||
        granted > RUN_REQUEST_MAX_EXTRA_RUNS
      ) {
        throw new AppError(
          400,
          `Runs to grant must be a whole number between ${RUN_REQUEST_MIN_EXTRA_RUNS} and ${formatRuns(asked)} (the number asked for)`,
        );
      }
      const requester = (await this.n8nRepositories.user.findByIdWithRole(row.requestedBy)) as RunRequestUserEntity | null;
      const firstName = requester?.firstName?.trim() ?? '';
      const decided = await this.customRepositories.rateLimitRequest.approveAsTopup(
        requestId,
        { grantedRuns: granted, decisionNote: note, decidedBy },
        {
          projectId: row.projectId,
          periodKey: row.periodKey as string,
          // The note shows on the top-up list; without one, label it as a run-request decision.
          adminComment: note ?? `Approved from ${firstName.length > 0 ? firstName : 'a member'}'s run request`,
        },
      );
      if (!decided) {
        throw await this.requestGoneError(row);
      }
      this.notifyRunRequestDecided(decided, decidedBy);
      return (await this.enrichRunRequests([decided]))[0];
    }

    // limit_increase: granted limits must stay within [current, asked] and be an actual change.
    const project = await this.n8nRepositories.project.findOneBy({ id: row.projectId });
    const kind = project?.type === 'personal' ? 'personal' : 'team';
    const [custom, defaults] = await Promise.all([
      this.customRepositories.projectRateLimit.get(row.projectId),
      this.customRepositories.projectRateLimitDefault.get(kind),
    ]);
    const currentWeekly =
      custom && !custom.usesDefaultLimits
        ? (custom.weeklyRateLimit ?? defaults?.weeklyRateLimit ?? null)
        : (defaults?.weeklyRateLimit ?? null);
    const currentAnnual =
      custom && !custom.usesDefaultLimits
        ? (custom.yearlyRateLimit ?? defaults?.yearlyRateLimit ?? null)
        : (defaults?.yearlyRateLimit ?? null);

    const newWeekly = body.newWeeklyLimit ?? null;
    const newAnnual = body.newAnnualLimit ?? null;
    if (row.requestedWeeklyLimit === null && newWeekly !== null) {
      throw new AppError(400, 'Only the periods the requester asked about can be changed');
    }
    if (row.requestedAnnualLimit === null && newAnnual !== null) {
      throw new AppError(400, 'Only the periods the requester asked about can be changed');
    }
    for (const [label, granted, asked, current] of [
      ['weekly', newWeekly, row.requestedWeeklyLimit, currentWeekly],
      ['annual', newAnnual, row.requestedAnnualLimit, currentAnnual],
    ] as const) {
      if (granted === null) {
        continue;
      }
      if (!Number.isInteger(granted) || granted < 1) {
        throw new AppError(400, `The new ${label} limit must be a whole number of at least 1`);
      }
      if (asked !== null && granted > asked) {
        throw new AppError(400, `The new ${label} limit cannot be higher than the ${formatRuns(asked)} asked for`);
      }
      if (current !== null && granted < current) {
        throw new AppError(400, `The new ${label} limit cannot be lower than the current limit of ${formatRuns(current)}`);
      }
    }
    if (newWeekly !== null && newAnnual !== null && newAnnual < newWeekly) {
      throw new AppError(400, 'The new annual limit must be at least the new weekly limit');
    }
    const isChange =
      (newWeekly !== null && (currentWeekly === null || newWeekly > currentWeekly)) ||
      (newAnnual !== null && (currentAnnual === null || newAnnual > currentAnnual));
    if (!isChange) {
      throw new AppError(400, 'Grant at least one limit above the current values, or deny the request');
    }

    const decided = await this.customRepositories.rateLimitRequest.approveAsLimitChange(
      requestId,
      {
        decidedWeeklyLimit: newWeekly,
        decidedAnnualLimit: newAnnual,
        decisionNote: note,
        decidedBy,
      },
      { projectId: row.projectId, lastAdminComment: note },
    );
    if (!decided) {
      throw await this.requestGoneError(row);
    }
    this.notifyRunRequestDecided(decided, decidedBy);
    return (await this.enrichRunRequests([decided]))[0];
  }

  /**
   * Denies a pending run request with a required reason (surfaced to the
   * requester verbatim in the decision email). Throws AppError 404 (unknown
   * request), 409 (cancelled or already decided) and 400 (invalid reason).
   */
  async denyRunRequest(
    requestId: string,
    body: { reason: string },
    decidedBy: string | null,
  ): Promise<AdminRunRequestItem> {
    const row = await this.customRepositories.rateLimitRequest.getById(requestId);
    if (!row) {
      throw new AppError(404, 'Request not found');
    }
    if (row.status !== 'pending') {
      throw await this.requestGoneError(row);
    }
    const reason = body.reason.trim();
    if (reason.length < 10 || reason.length > 500) {
      throw new AppError(400, 'Reason must be between 10 and 500 characters');
    }
    const decided = await this.customRepositories.rateLimitRequest.rejectPending(requestId, {
      decisionNote: reason,
      decidedBy,
    });
    if (!decided) {
      throw await this.requestGoneError(row);
    }
    this.notifyRunRequestDecided(decided, decidedBy);
    return (await this.enrichRunRequests([decided]))[0];
  }

  /** Maps a lost decide race (concurrent cancel or second decision) to its 409 message. */
  private async requestGoneError(row: RateLimitRequest): Promise<AppError> {
    const fresh = (await this.customRepositories.rateLimitRequest.getById(row.id)) ?? row;
    if (fresh.status === 'cancelled') {
      return new AppError(409, 'This request was cancelled by the requester');
    }
    return new AppError(409, 'This request has already been decided');
  }

  /** Resolves an admin display name ("Jordan Lee") from an email, falling back to the email. */
  private async resolveUserDisplayName(email: string | null): Promise<string | null> {
    if (!email || email.trim().length === 0) {
      return null;
    }
    try {
      const names = await this.n8nRepositories.user.findUserNamesByEmails([email.trim()]);
      return formatFullName(names.get(email.trim().toLowerCase()), email.trim());
    } catch (error) {
      log.warn('Failed to resolve a user display name; falling back to the email', {
        error: error instanceof Error ? error.message : String(error),
      });
      return email.trim();
    }
  }

  /**
   * Enriches request rows for the admin list: project, requester identity and
   * role, usage when sent and now, current effective limits, and the
   * last-top-up / last-limit-change context for the review dialogs. Caches
   * per-project and per-user lookups across rows (the same project or member
   * can appear in several requests).
   */
  private async enrichRunRequests(rows: RateLimitRequest[]): Promise<AdminRunRequestItem[]> {
    const projectCache = new Map<string, { name: string; type: string } | null>();
    const requesterCache = new Map<string, RunRequestUserEntity | null>();
    const roleCache = new Map<string, string | null>();
    const limitsCache = new Map<
      string,
      {
        custom: ProjectRateLimit | null;
        weekly: number | null;
        yearly: number | null;
        lastTopup: AdminRunRequestItem['lastTopup'];
      }
    >();

    const nowKeys = getCurrentPeriodKeys();

    const items = await Promise.all(
      rows.map(async (row): Promise<AdminRunRequestItem> => {
        let project = projectCache.get(row.projectId);
        if (project === undefined) {
          const loaded = await this.n8nRepositories.project.findOneBy({ id: row.projectId });
          project = loaded ? { name: loaded.name, type: loaded.type } : null;
          projectCache.set(row.projectId, project);
        }
        let requester = requesterCache.get(row.requestedBy);
        if (requester === undefined) {
          requester = (await this.n8nRepositories.user.findByIdWithRole(row.requestedBy)) as RunRequestUserEntity | null;
          requesterCache.set(row.requestedBy, requester);
        }
        const roleKey = `${row.requestedBy}:${row.projectId}`;
        let roleLabel = roleCache.get(roleKey);
        if (roleLabel === undefined) {
          const role = await this.n8nRepositories.projectRelation.findProjectRole({
            userId: row.requestedBy,
            projectId: row.projectId,
          });
          const slug = extractRoleSlug(role);
          roleLabel = slug ? (RUN_REQUEST_ROLE_LABELS[slug] ?? slug) : null;
          roleCache.set(roleKey, roleLabel);
        }
        let limits = limitsCache.get(row.projectId);
        if (limits === undefined) {
          const kind = project?.type === 'personal' ? 'personal' : 'team';
          const [custom, defaults, topups] = await Promise.all([
            this.customRepositories.projectRateLimit.get(row.projectId),
            this.customRepositories.projectRateLimitDefault.get(kind),
            this.customRepositories.projectTopup.list(row.projectId, 1, 1),
          ]);
          const latestTopup = topups.rows[0] ?? null;
          limits = {
            custom,
            weekly:
              custom && !custom.usesDefaultLimits
                ? (custom.weeklyRateLimit ?? defaults?.weeklyRateLimit ?? null)
                : (defaults?.weeklyRateLimit ?? null),
            yearly:
              custom && !custom.usesDefaultLimits
                ? (custom.yearlyRateLimit ?? defaults?.yearlyRateLimit ?? null)
                : (defaults?.yearlyRateLimit ?? null),
            lastTopup: latestTopup
              ? {
                  amount: latestTopup.amount,
                  periodKey: latestTopup.periodKey,
                  createdAt: latestTopup.createdAt.toISOString(),
                  createdByName: await this.resolveUserDisplayName(latestTopup.createdBy),
                }
              : null,
          };
          limitsCache.set(row.projectId, limits);
        }

        // "When sent" usage: the asked week for extra-runs requests, the week
        // the request was filed otherwise; the year always from the filed date.
        const sentKeys = getCurrentPeriodKeys(row.createdAt);
        const sentWeeklyKey = row.requestKind === 'extra_runs' ? (row.periodKey ?? sentKeys.weekly) : sentKeys.weekly;
        const [sentCounts, nowCounts] = await Promise.all([
          this.customRepositories.projectExecutionUsage.getCounts(row.projectId, sentWeeklyKey, sentKeys.yearly),
          this.customRepositories.projectExecutionUsage.getCounts(row.projectId, nowKeys.weekly, nowKeys.yearly),
        ]);

        const requesterEmail = requester?.email?.trim() ?? null;
        let lastLimitChange: AdminRunRequestItem['lastLimitChange'] = null;
        if (limits.custom?.updatedAt) {
          lastLimitChange = {
            at: limits.custom.updatedAt.toISOString(),
            byName: await this.resolveUserDisplayName(limits.custom.updatedBy),
          };
        }

        return {
          id: row.id,
          projectId: row.projectId,
          projectName: project?.name ?? row.projectId,
          projectType: project?.type ?? 'team',
          requestKind: row.requestKind as RunRequestKind,
          status:
            row.status === 'approved'
              ? 'approved'
              : row.status === 'cancelled'
                ? 'cancelled'
                : row.status === 'rejected'
                  ? 'denied'
                  : 'pending',
          extraRuns: row.extraRuns,
          periodKey: row.periodKey,
          requestedWeeklyLimit: row.requestedWeeklyLimit,
          requestedAnnualLimit: row.requestedAnnualLimit,
          reason: row.reason,
          requestedBy: row.requestedBy,
          requestedByName: formatFullName(requester ?? undefined, requesterEmail),
          requestedByEmail: requesterEmail,
          requestedByRoleLabel: roleLabel,
          createdAt: row.createdAt.toISOString(),
          weeklyUsedWhenSent: sentCounts.weeklyCount,
          yearlyUsedWhenSent: sentCounts.yearlyCount,
          weeklyUsedNow: nowCounts.weeklyCount,
          yearlyUsedNow: nowCounts.yearlyCount,
          currentWeeklyLimit: limits.weekly,
          currentAnnualLimit: limits.yearly,
          lastTopup: limits.lastTopup,
          lastLimitChange,
          ...serializeDecisionFields(row),
          decidedByName: await this.resolveUserDisplayName(row.decidedBy),
        };
      }),
    );
    return items;
  }

  /**
   * Spawns the decision email to the requester (fire-and-forget like the other
   * rate-limit notifications). Supersedes the generic top-up/limits-change
   * notifications: the decision email already spells out what was granted.
   */
  private notifyRunRequestDecided(row: RateLimitRequest, decidedBy: string | null): void {
    if (!this.nodeMailerService) {
      return;
    }
    void (async () => {
      try {
        const context = await this.resolveProjectContext(row.projectId);
        if (!context) {
          log.warn('Project not found when sending the run-request decision email', { requestId: row.id });
          return;
        }
        const requester = (await this.n8nRepositories.user.findByIdWithRole(row.requestedBy)) as RunRequestUserEntity | null;
        const to = requester?.email?.trim() ?? null;
        if (!to) {
          log.warn('No requester email resolved for the run-request decision email', { requestId: row.id });
          return;
        }
        const decidedByName = await this.resolveUserDisplayName(decidedBy);
        let subject: string;
        let html: string;
        if (row.status === 'approved' && row.requestKind === 'extra_runs') {
          subject = `Your extra-runs request for ${context.projectName} was approved`;
          html = renderEmail('rateLimitRequestTopupApproved', {
            projectName: context.projectName,
            amount: formatRuns(row.grantedRuns ?? 0),
            weekDescription: describeWeeklyPeriodKey(row.periodKey ?? '') ?? (row.periodKey ?? ''),
            adminNote: row.decisionNote ?? undefined,
            decidedByName,
            projectUrl: context.projectUrl,
          });
        } else if (row.status === 'approved') {
          subject = `Your limit-raise request for ${context.projectName} was approved`;
          html = renderEmail('rateLimitRequestLimitsApproved', {
            projectName: context.projectName,
            weeklyLimit: row.decidedWeeklyLimit !== null ? formatRuns(row.decidedWeeklyLimit) : 'unchanged',
            yearlyLimit: row.decidedAnnualLimit !== null ? formatRuns(row.decidedAnnualLimit) : 'unchanged',
            adminNote: row.decisionNote ?? undefined,
            decidedByName,
            projectUrl: context.projectUrl,
          });
        } else {
          subject = `Your run request for ${context.projectName} was denied`;
          html = renderEmail('rateLimitRequestDenied', {
            projectName: context.projectName,
            reason: row.decisionNote ?? '',
            decidedByName,
            projectUrl: context.projectUrl,
          });
        }
        await this.nodeMailerService!.sendMail({ to, subject, html });
        log.info('Sent the run-request decision email', { requestId: row.id, status: row.status });
      } catch (error) {
        log.error('Failed to send the run-request decision email', {
          requestId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }

  /** Throws AppError 404 when the project does not exist in n8n. */
  private async assertProjectExists(projectId: string): Promise<void> {
    const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
    if (!project) {
      throw new AppError(404, 'Project not found');
    }
  }
}
