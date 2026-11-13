'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildRateLimitPreExecuteHandler = buildRateLimitPreExecuteHandler;
exports.createMemoizedRateLimitServiceGetter = createMemoizedRateLimitServiceGetter;
exports.createRateLimitPreExecuteHandler = createRateLimitPreExecuteHandler;
const _config_1 = require('@config');
const n8n_paths_1 = require('../constants/n8n-paths');
const project_rate_limit_service_1 = require('../services/project-rate-limit.service');
const custom_repositories_1 = require('./custom-repositories');
const n8n_repositories_1 = require('./n8n-repositories');
const services_1 = require('./services');
const logger_1 = require('../utils/logger');
const log = (0, logger_1.createLogger)('RateLimitHook');
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
function isExemptMode(mode) {
  return mode === 'manual' || mode === 'internal' || mode.startsWith('evaluation') || mode.startsWith('eval_');
}
/**
 * Builds the workflow.preExecute policy on injected collaborators. The hook
 * itself (api/hooks.ts) is not covered by tests, so the behaviour lives here.
 */
function buildRateLimitPreExecuteHandler(deps) {
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
      const countUsage = _config_1.EXECUTIONS_MODE !== 'queue' || deps.isWorkerProcess();
      await service.enforceExecution({ workflowId: workflow.id, mode, countUsage });
    } catch (error) {
      // A hard-stop breach must abort the run; everything else fails open.
      if (error instanceof project_rate_limit_service_1.RateLimitExceededError) throw error;
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
function createMemoizedRateLimitServiceGetter(databaseUrl) {
  /** Resolved by the build attempt on failure, to reset the memo. */
  const BUILD_FAILED = Symbol('rate-limit-build-failed');
  let memoized = null;
  return function resolveRateLimitService() {
    if (!memoized) {
      memoized = (async () => {
        if (!databaseUrl) {
          log.error('Rate limiting disabled in this process: CUSTOM_DATABASE_URL is not set');
          return null;
        }
        try {
          const { container, n8nRepositories } = (0, n8n_repositories_1.buildN8nRuntimeContext)();
          const customRepositories = (0, custom_repositories_1.buildCustomRepositories)(databaseUrl);
          // Notifications are optional: a process without the mailer (some
          // workers) still enforces, it just never sends emails.
          const nodeMailerService = (0, services_1.tryResolveNodeMailerService)(container);
          return new project_rate_limit_service_1.ProjectRateLimitService(
            n8nRepositories,
            customRepositories,
            nodeMailerService,
          );
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
let isWorkerCache = null;
/**
 * Whether this process is an n8n queue worker (`n8n worker` command).
 * Resolved once from n8n's InstanceSettings via the DI container: n8n
 * constructs InstanceSettings when the command boots (BaseCommand field
 * initializer), before any external hook can fire, and the container is
 * process-global — so this works in main and worker processes alike.
 */
function isWorkerProcess() {
  if (isWorkerCache === null) {
    // InstanceSettings is exported from the n8n-core package root — the
    // same module (and class reference) the DI container keys the
    // singleton by.
    const { Container } = require(n8n_paths_1.N8N_DI_PATH);
    const { InstanceSettings } = require(n8n_paths_1.N8N_CORE_PATH);
    isWorkerCache = Container.get(InstanceSettings).isWorker;
  }
  return isWorkerCache;
}
/** Process-wide memoized service getter backing the default wiring. */
const getRateLimitService = createMemoizedRateLimitServiceGetter(_config_1.CUSTOM_DATABASE_URL);
/**
 * Default wiring for api/hooks.ts: real dependencies from config, the n8n
 * DI container and the custom database. Safe to call in every process
 * (main, worker, webhook) — all n8n access is deferred to first use.
 */
function createRateLimitPreExecuteHandler() {
  return buildRateLimitPreExecuteHandler({
    isEnabled: () => _config_1.RATE_LIMIT_ENFORCEMENT_ENABLED,
    resolveRateLimitService: getRateLimitService,
    isWorkerProcess,
  });
}
