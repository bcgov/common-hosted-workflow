import { CUSTOM_DATABASE_URL, EXECUTIONS_MODE, RATE_LIMIT_ENFORCEMENT_ENABLED } from '@config';
import { N8N_CORE_PATH, N8N_DI_PATH } from '../constants/n8n-paths';
import { ProjectRateLimitService, RateLimitExceededError } from '../services/project-rate-limit.service';
import type { WorkflowPreExecuteHook } from '../types/hooks';
import { buildCustomRepositories } from './custom-repositories';
import { buildN8nRuntimeContext, type N8nContainer } from './n8n-repositories';
import { createLogger } from '../utils/logger';

const log = createLogger('RateLimitHook');

/**
 * workflow.preExecute enforcement for per-project execution rate limiting.
 *
 * n8n fires `workflow.preExecute` on workflowExecuteBefore in the main
 * process (regular and queue mode), in workers and for sub-executions —
 * but `n8n.ready` only ever fires in main, so the ready-hook closures in
 * api/hooks.ts stay null in workers. Everything this hook needs is
 * therefore resolved lazily and standalone in any process: the enforcement
 * service is built on first use from the n8n DI container plus the custom
 * database, and in main it is intentionally a separate instance from the
 * ready-hook's services (a second drizzle pool in main is acceptable).
 *
 * Fail-open: any error except RateLimitExceededError is logged and the
 * execution is allowed. Only a hard-stop breach aborts the run.
 */

/**
 * Manual editor runs, n8n-internal runs and evaluation runs are neither
 * counted nor blocked. Must stay in sync with the service's private
 * isExemptMode predicate (src/api/services/project-rate-limit.service.ts);
 * the service re-checks defensively in case a caller forgets.
 */
function isExemptMode(mode: string): boolean {
  return mode === 'manual' || mode === 'internal' || mode.startsWith('evaluation') || mode.startsWith('eval_');
}

/** Collaborators the preExecute hook policy needs; injectable for unit tests. */
export type RateLimitHookDeps = {
  /** Kill switch reading RATE_LIMIT_ENFORCEMENT_ENABLED. */
  isEnabled(): boolean;
  /**
   * Lazily resolves the enforcement service; null means enforcement is
   * disabled in this process (e.g. missing CUSTOM_DATABASE_URL on a
   * worker) and the hook returns without enforcing.
   */
  resolveRateLimitService(): Promise<ProjectRateLimitService | null>;
  /** Whether this process is an n8n queue worker; only consulted in queue mode. */
  isWorkerProcess(): boolean;
};

/**
 * Builds the workflow.preExecute policy on injected collaborators. The hook
 * itself (api/hooks.ts) is not covered by tests, so the behaviour lives here.
 */
export function buildRateLimitPreExecuteHandler(deps: RateLimitHookDeps): WorkflowPreExecuteHook {
  return async function rateLimitPreExecute(workflow, mode) {
    try {
      // Kill switch: cheapest check first — nothing resolved, nothing logged.
      if (!deps.isEnabled()) return;

      // Manual/internal/evaluation runs are neither counted nor blocked.
      if (isExemptMode(mode)) return;

      // Null = enforcement disabled in this process; fail open silently.
      const service = await deps.resolveRateLimitService();
      if (!service) return;

      // Count usage only on the process that actually runs the execution:
      // every process in regular mode; workers only in queue mode (main
      // pre-checks runs there but must not double-count them).
      const countUsage = EXECUTIONS_MODE !== 'queue' || deps.isWorkerProcess();

      await service.enforceExecution({ workflowId: workflow.id, mode, countUsage });
    } catch (error) {
      // A hard-stop breach must abort the run; everything else fails open.
      if (error instanceof RateLimitExceededError) throw error;
      log.error('Rate limit pre-execute hook failed; failing open', {
        workflowId: workflow?.id,
        mode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

/**
 * Builds a promise-memoized rate-limit service getter for one process.
 *
 * - Empty databaseUrl (worker without custom-DB credentials): logs one
 *   error and memoizes the disabled state so it never retries or spams
 *   the logs — enforcement stays off for the life of the process.
 * - Build failure: the memo is cleared so the next execution retries
 *   (preExecute may fire before the DI container finished bootstrapping);
 *   a failure is never memoized permanently.
 */
export function createMemoizedRateLimitServiceGetter(
  databaseUrl: string,
): () => Promise<ProjectRateLimitService | null> {
  /** Resolved by the build attempt on failure, to reset the memo. */
  const BUILD_FAILED = Symbol('rate-limit-build-failed');
  let memoized: Promise<ProjectRateLimitService | null> | null = null;

  return function resolveRateLimitService(): Promise<ProjectRateLimitService | null> {
    if (!memoized) {
      memoized = (async (): Promise<ProjectRateLimitService | null | typeof BUILD_FAILED> => {
        if (!databaseUrl) {
          log.error('Rate limiting disabled in this process: CUSTOM_DATABASE_URL is not set');
          return null;
        }
        try {
          const { n8nRepositories } = buildN8nRuntimeContext();
          const customRepositories = buildCustomRepositories(databaseUrl);
          return new ProjectRateLimitService(n8nRepositories, customRepositories);
        } catch (error) {
          log.error('Failed to build the rate limit service; failing open', {
            error: error instanceof Error ? error.message : String(error),
          });
          return BUILD_FAILED;
        }
      })().then((result) => {
        if (result === BUILD_FAILED) {
          memoized = null; // retry on the next execution, never memoize failures
          return null;
        }
        return result;
      });
    }
    return memoized;
  };
}

let isWorkerCache: boolean | null = null;

/**
 * Whether this process is an n8n queue worker (`n8n worker` command).
 * Resolved once from n8n's InstanceSettings via the DI container: n8n
 * constructs InstanceSettings when the command boots (BaseCommand field
 * initializer), before any external hook can fire, and the container is
 * process-global — so this works in main and worker processes alike.
 */
function isWorkerProcess(): boolean {
  if (isWorkerCache === null) {
    // InstanceSettings is exported from the n8n-core package root — the
    // same module (and class reference) the DI container keys the
    // singleton by.
    const { Container } = require(N8N_DI_PATH) as { Container: N8nContainer };
    const { InstanceSettings } = require(N8N_CORE_PATH) as { InstanceSettings: unknown };
    isWorkerCache = Container.get<{ isWorker: boolean }>(InstanceSettings).isWorker;
  }
  return isWorkerCache;
}

/** Process-wide memoized service getter backing the default wiring. */
const getRateLimitService = createMemoizedRateLimitServiceGetter(CUSTOM_DATABASE_URL);

/**
 * Default wiring for api/hooks.ts: real dependencies from config, the n8n
 * DI container and the custom database. Safe to call in every process
 * (main, worker, webhook) — all n8n access is deferred to first use.
 */
export function createRateLimitPreExecuteHandler(): WorkflowPreExecuteHook {
  return buildRateLimitPreExecuteHandler({
    isEnabled: () => RATE_LIMIT_ENFORCEMENT_ENABLED,
    resolveRateLimitService: getRateLimitService,
    isWorkerProcess,
  });
}
