import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { ProjectRateLimit } from '../../db/schema/project-rate-limit';
import { getCurrentPeriodKeys } from '../helpers/period';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('ProjectRateLimit');

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

/** Per-project admin-list enrichment: configured limits, current-period usage, workflow count. */
export type ProjectRateLimitEnrichment = {
  weeklyRateLimit: number | null;
  yearlyRateLimit: number | null;
  stopBehavior: RateLimitStopBehavior | null;
  lastAdminComment: string | null;
  weeklyExecutionCount: number;
  yearlyExecutionCount: number;
  workflowCount: number;
};

function defaultEnrichment(): ProjectRateLimitEnrichment {
  return {
    weeklyRateLimit: null,
    yearlyRateLimit: null,
    stopBehavior: null,
    lastAdminComment: null,
    weeklyExecutionCount: 0,
    yearlyExecutionCount: 0,
    workflowCount: 0,
  };
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
  limit: number;
  count: number;
};

function describeBreach(projectId: string, breach: LimitBreach): string {
  const label = breach.period === 'weekly' ? 'Weekly' : 'Yearly';
  return `${label} execution limit reached for project '${projectId}' (limit ${breach.limit}, used ${breach.count} in ${breach.periodKey}).`;
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

      const breaches: LimitBreach[] = [];
      if (config && config.weeklyRateLimit !== null && counts.weeklyCount >= config.weeklyRateLimit) {
        breaches.push({
          period: 'weekly',
          periodKey: periodKeys.weekly,
          limit: config.weeklyRateLimit,
          count: counts.weeklyCount,
        });
      }
      if (config && config.yearlyRateLimit !== null && counts.yearlyCount >= config.yearlyRateLimit) {
        breaches.push({
          period: 'yearly',
          periodKey: periodKeys.yearly,
          limit: config.yearlyRateLimit,
          count: counts.yearlyCount,
        });
      }

      if (breaches.length > 0 && config) {
        if (config.stopBehavior === 'soft_stop') {
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
  ): Promise<ProjectRateLimit> {
    const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
    if (!project) {
      throw new AppError(404, 'Project not found');
    }

    await this.customRepositories.projectRateLimit.upsert({ projectId, ...body });

    const stored = await this.customRepositories.projectRateLimit.get(projectId);
    if (!stored) {
      throw new AppError(500, 'Failed to read the stored rate limit');
    }
    return stored;
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
      const [rateLimitMap, usageMap, workflowCountMap] = await Promise.all([
        this.customRepositories.projectRateLimit.listByProjectIds(projectIds),
        this.customRepositories.projectExecutionUsage.listCountsByProjectIds(
          projectIds,
          periodKeys.weekly,
          periodKeys.yearly,
        ),
        this.n8nRepositories.sharedWorkflow.countByProjectIds(projectIds),
      ]);

      for (const projectId of projectIds) {
        const config = rateLimitMap.get(projectId);
        const usage = usageMap.get(projectId);
        const workflowCount = workflowCountMap.get(projectId);
        enrichment[projectId] = {
          weeklyRateLimit: config?.weeklyRateLimit ?? null,
          yearlyRateLimit: config?.yearlyRateLimit ?? null,
          stopBehavior: (config?.stopBehavior as RateLimitStopBehavior | undefined) ?? null,
          lastAdminComment: config?.lastAdminComment ?? null,
          weeklyExecutionCount: usage?.weeklyCount ?? 0,
          yearlyExecutionCount: usage?.yearlyCount ?? 0,
          workflowCount: workflowCount ?? 0,
        };
      }
    } catch (error) {
      log.error('Failed to enrich admin projects with rate-limit data; returning defaults', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return enrichment;
  }
}
