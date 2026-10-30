import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { ProjectRateLimit } from '../../db/schema/project-rate-limit';
import type { ProjectRateLimitDefault } from '../../db/schema/project-rate-limit-default';
import type { ProjectTopup } from '../../db/schema/project-topup';
import { getCurrentPeriodKeys, listUpcomingWeeklyPeriodKeys } from '../helpers/period';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('ProjectRateLimit');

/** Top-ups may target the current week plus the following 25 (≈ half a year). */
export const MAX_TOPUP_HORIZON_WEEKS = 26;

/** Upper bound for a single top-up amount, in runs. */
export const MAX_TOPUP_AMOUNT = 1_000_000;

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

/** Per-project admin-list enrichment: configured limits, current-period usage, workflow count, editor stamp. */
export type ProjectRateLimitEnrichment = {
  weeklyRateLimit: number | null;
  yearlyRateLimit: number | null;
  stopBehavior: RateLimitStopBehavior | null;
  lastAdminComment: string | null;
  weeklyExecutionCount: number;
  yearlyExecutionCount: number;
  /** Runs added by top-ups for the current week (0 when none). */
  weeklyTopupRuns: number;
  workflowCount: number;
  membersCount: number;
  updatedAt: string | null;
  updatedByName: string | null;
};

function defaultEnrichment(): ProjectRateLimitEnrichment {
  return {
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
  /** Effective limit that was enforced (base limit plus top-ups for weekly). */
  limit: number;
  count: number;
  /** Runs added by top-ups on top of the base limit; weekly breaches only. */
  topupRuns?: number;
};

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

      // Effective base limits: the project's own configuration first, then its
      // scope's saved defaults (team/personal). A scope with no defaults stays
      // uncapped for that period. The project-kind lookup runs only when a
      // fallback can matter (some limit is unset), keeping configured projects
      // at the same query count as before.
      let weeklyBase = config?.weeklyRateLimit ?? null;
      let yearlyBase = config?.yearlyRateLimit ?? null;
      if (weeklyBase === null || yearlyBase === null) {
        const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
        const kind = project?.type === 'personal' ? 'personal' : 'team';
        const defaults = await this.customRepositories.projectRateLimitDefault.get(kind);
        weeklyBase = weeklyBase ?? defaults?.weeklyRateLimit ?? null;
        yearlyBase = yearlyBase ?? defaults?.yearlyRateLimit ?? null;
      }

      // Top-ups raise the effective weekly limit whenever a weekly base is
      // enforced, whether it comes from the project's own configuration or a
      // scope default.
      let weeklyTopupRuns = 0;
      if (weeklyBase !== null) {
        const topupSums = await this.customRepositories.projectTopup.sumByProjectIds([projectId], periodKeys.weekly);
        weeklyTopupRuns = topupSums.get(projectId) ?? 0;
      }

      const breaches: LimitBreach[] = [];
      if (weeklyBase !== null) {
        const effectiveWeeklyLimit = weeklyBase + weeklyTopupRuns;
        if (counts.weeklyCount >= effectiveWeeklyLimit) {
          breaches.push({
            period: 'weekly',
            periodKey: periodKeys.weekly,
            limit: effectiveWeeklyLimit,
            count: counts.weeklyCount,
            topupRuns: weeklyTopupRuns,
          });
        }
      }
      if (yearlyBase !== null && counts.yearlyCount >= yearlyBase) {
        breaches.push({
          period: 'yearly',
          periodKey: periodKeys.yearly,
          limit: yearlyBase,
          count: counts.yearlyCount,
        });
      }

      if (breaches.length > 0) {
        // Without a project row the stop behavior is the hard-stop default.
        if (config?.stopBehavior === 'soft_stop') {
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

  /**
   * Replaces the rate-limit configuration for a project (full-replace semantics).
   * `updatedBy` records the acting admin's email (trimmed; an empty value is
   * stored as null — display names are resolved at read time).
   * Throws AppError 404 when the project does not exist in n8n.
   */
  async updateRateLimit(
    projectId: string,
    body: {
      weeklyRateLimit: number | null;
      yearlyRateLimit: number | null;
      lastAdminComment: string | null;
      stopBehavior: RateLimitStopBehavior;
    },
    updatedBy: string | null,
  ): Promise<ProjectRateLimit> {
    await this.assertProjectExists(projectId);

    const trimmedUpdatedBy = updatedBy !== null && updatedBy.trim().length > 0 ? updatedBy.trim() : null;
    await this.customRepositories.projectRateLimit.upsert({ projectId, ...body, updatedBy: trimmedUpdatedBy });

    const stored = await this.customRepositories.projectRateLimit.get(projectId);
    if (!stored) {
      throw new AppError(500, 'Failed to read the stored rate limit');
    }
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
   * and returns the enrichment keyed by projectId. Unconfigured projects get
   * null limits/comment and zero counts.
   *
   * Never throws: on any error the default enrichment is returned so the
   * admin project list keeps working during custom-DB outages.
   */
  async enrichAdminProjects(items: Array<{ projectId: string }>): Promise<Record<string, ProjectRateLimitEnrichment>> {
    const projectIds = items.map((item) => item.projectId);
    const enrichment: Record<string, ProjectRateLimitEnrichment> = {};
    for (const projectId of projectIds) {
      enrichment[projectId] = defaultEnrichment();
    }
    if (projectIds.length === 0) {
      return enrichment;
    }

    try {
      const periodKeys = getCurrentPeriodKeys();
      const [rateLimitMap, usageMap, workflowCountMap, memberCountMap, topupMap] = await Promise.all([
        this.customRepositories.projectRateLimit.listByProjectIds(projectIds),
        this.customRepositories.projectExecutionUsage.listCountsByProjectIds(
          projectIds,
          periodKeys.weekly,
          periodKeys.yearly,
        ),
        this.n8nRepositories.sharedWorkflow.countByProjectIds(projectIds),
        this.n8nRepositories.projectRelation.countMembersByProjectIds(projectIds),
        this.customRepositories.projectTopup.sumByProjectIds(projectIds, periodKeys.weekly),
      ]);

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

      for (const projectId of projectIds) {
        const config = rateLimitMap.get(projectId);
        const usage = usageMap.get(projectId);
        const workflowCount = workflowCountMap.get(projectId);
        const memberCount = memberCountMap.get(projectId);
        const editorEmail =
          config?.updatedBy != null && config.updatedBy.trim().length > 0 ? config.updatedBy.trim() : null;
        const editorName = nameMap?.get(editorEmail?.toLowerCase() ?? '');
        enrichment[projectId] = {
          weeklyRateLimit: config?.weeklyRateLimit ?? null,
          yearlyRateLimit: config?.yearlyRateLimit ?? null,
          stopBehavior: (config?.stopBehavior as RateLimitStopBehavior | undefined) ?? null,
          lastAdminComment: config?.lastAdminComment ?? null,
          weeklyExecutionCount: usage?.weeklyCount ?? 0,
          yearlyExecutionCount: usage?.yearlyCount ?? 0,
          weeklyTopupRuns: topupMap.get(projectId) ?? 0,
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
    return this.customRepositories.projectTopup.create({
      projectId,
      periodKey: body.periodKey,
      amount: body.amount,
      adminComment: body.adminComment.trim(),
      createdBy: trimmedCreatedBy,
    });
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

  /** Throws AppError 404 when the project does not exist in n8n. */
  private async assertProjectExists(projectId: string): Promise<void> {
    const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
    if (!project) {
      throw new AppError(404, 'Project not found');
    }
  }
}
