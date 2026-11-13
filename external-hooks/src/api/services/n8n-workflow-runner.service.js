'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.N8nWorkflowRunnerService = exports.WIL_TARGET_UNAVAILABLE_CODE = void 0;
exports.extractLastNodeOutput = extractLastNodeOutput;
exports.isPublicationServiceEnabled = isPublicationServiceEnabled;
exports.createN8nWorkflowRunnerService = createN8nWorkflowRunnerService;
const n8n_paths_1 = require('../constants/n8n-paths');
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
/**
 * The ONLY module that touches n8n's execution internals (`WorkflowRunner`, `ActiveExecutions`,
 * published-version loading). It replicates what n8n does when a trigger node emits
 * (`WorkflowExecutionService.runWorkflow` in n8n/dist/workflows/workflow-execution.service.js):
 *
 *   nodeExecutionStack = [{ node, data: { main: [items] }, source: null }]
 *   WorkflowRunner.run({ executionMode: 'trigger', executionData, workflowData, projectId }, true)
 *
 * so the run goes through the normal production path (queue mode → worker, concurrency limits).
 * See .kiro/artifacts/wil-trigger-node/PHASE0-FINDINGS.md. Re-verify against n8n on every base-image bump.
 */
const log = (0, logger_1.createLogger)('N8nWorkflowRunner');
exports.WIL_TARGET_UNAVAILABLE_CODE = 'WIL_TARGET_UNAVAILABLE';
function mapRunStatus(run) {
  switch (run.status) {
    case 'success':
      return 'succeeded';
    case 'error':
    case 'crashed':
    case 'canceled':
      return 'failed';
    default:
      return 'dispatched';
  }
}
/** Mirrors the Webhook node's "last node" response: one item → its json, several → array of json. */
function extractLastNodeOutput(run) {
  const resultData = run.data?.resultData;
  const lastNode = resultData?.lastNodeExecuted;
  if (!lastNode) return undefined;
  const taskRuns = resultData?.runData?.[lastNode];
  const items = taskRuns?.[taskRuns.length - 1]?.data?.main?.[0];
  if (!items?.length) return undefined;
  const jsons = items.map((item) => item.json ?? {});
  return jsons.length === 1 ? jsons[0] : jsons;
}
class N8nWorkflowRunnerService {
  deps;
  unavailableReason;
  constructor(deps, unavailableReason = 'n8n workflow runner is not available') {
    this.deps = deps;
    this.unavailableReason = unavailableReason;
  }
  /** False when the n8n internals could not be resolved at startup (feature then answers 503). */
  get available() {
    return this.deps !== null;
  }
  /** Mirrors n8n's publication-service flag so discovery queries read the same table the runner does. */
  get usesPublicationService() {
    return this.deps?.usePublicationService ?? false;
  }
  requireDeps() {
    if (!this.deps) throw new errors_1.AppError(503, this.unavailableReason);
    return this.deps;
  }
  /** Loads the PUBLISHED version of a workflow, or null when unpublished/archived/missing. */
  async loadPublished(workflowId) {
    return await this.requireDeps().loadPublished(workflowId);
  }
  /** Starts a published workflow at `startNodeId` through n8n's normal production execution path. */
  async start(params) {
    const deps = this.requireDeps();
    const { published, startNodeId, items, wait } = params;
    const node = published.workflow.nodes.find((candidate) => candidate.id === startNodeId);
    if (!node) {
      throw new errors_1.AppError(409, 'Workflow trigger node not found', {
        code: exports.WIL_TARGET_UNAVAILABLE_CODE,
      });
    }
    const executionData = deps.createRunExecutionData({
      executionData: { nodeExecutionStack: [{ node, data: { main: [items] }, source: null }] },
    });
    const runData = {
      executionMode: 'trigger',
      executionData,
      workflowData: published.workflow,
      ...(published.projectId ? { projectId: published.projectId } : {}),
      // Queue mode: main needs the full run data to read the last node's output.
      ...(wait ? { forceFullExecutionData: true } : {}),
    };
    let executionId;
    try {
      executionId = await deps.runner.run(runData, true);
    } catch (error) {
      log.error('Failed to start workflow execution', {
        workflowId: published.workflow.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new errors_1.AppError(502, 'Failed to start workflow');
    }
    if (!wait) return { executionId, status: 'dispatched' };
    return await this.awaitResult(deps, executionId, wait.timeoutMs);
  }
  async awaitResult(deps, executionId, timeoutMs) {
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    try {
      const run = await Promise.race([this.resolveRun(deps, executionId), timeout]);
      // Timeout/unknown: the execution keeps running; never cancel it from here.
      if (run === 'timeout' || !run) return { executionId, status: 'dispatched' };
      const status = mapRunStatus(run);
      return status === 'succeeded'
        ? { executionId, status, result: extractLastNodeOutput(run) }
        : { executionId, status };
    } catch (error) {
      log.warn('Could not read execution result', {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { executionId, status: 'dispatched' };
    } finally {
      clearTimeout(timer);
    }
  }
  /** n8n drops finished runs from `ActiveExecutions`, so a very fast run needs the stored execution. */
  async resolveRun(deps, executionId) {
    try {
      return (await deps.activeExecutions.getPostExecutePromise(executionId)) ?? null;
    } catch {
      return await deps.findFinishedRun(executionId);
    }
  }
}
exports.N8nWorkflowRunnerService = N8nWorkflowRunnerService;
const OWNER_ROLE = 'workflow:owner';
function ownerProjectId(shared) {
  return shared?.find((entry) => entry.role === OWNER_ROLE)?.projectId ?? null;
}
/** Same selection n8n's live webhooks use: `N8N_USE_WORKFLOW_PUBLICATION_SERVICE` decides the source. */
function isPublicationServiceEnabled(container) {
  try {
    const { WorkflowsConfig } = require(n8n_paths_1.N8N_CONFIG_PATH);
    return Boolean(container.get(WorkflowsConfig).useWorkflowPublicationService);
  } catch (error) {
    log.warn('Could not read WorkflowsConfig; falling back to env', {
      error: error instanceof Error ? error.message : String(error),
    });
    return process.env.N8N_USE_WORKFLOW_PUBLICATION_SERVICE === 'true';
  }
}
function toPublishedWorkflow(entity, version) {
  // Drop relation payloads; WorkflowRunner only needs the plain workflow fields + the published graph.
  const workflowFields = {};
  for (const [key, value] of Object.entries(entity)) {
    if (key !== 'shared' && key !== 'activeVersion') workflowFields[key] = value;
  }
  return {
    workflow: {
      ...workflowFields,
      nodes: version.nodes,
      connections: version.connections,
      versionId: version.versionId,
    },
    projectId: ownerProjectId(entity.shared),
  };
}
/**
 * Resolves n8n's runner classes from the running n8n process. Never throws: when n8n internals are missing
 * (e.g. after an upgrade) it logs a clear error and returns an unavailable service so n8n itself keeps booting.
 */
function createN8nWorkflowRunnerService(container, n8nRepositories) {
  try {
    const { WorkflowRunner } = require(n8n_paths_1.N8N_WORKFLOW_RUNNER_PATH);
    const { ActiveExecutions } = require(n8n_paths_1.N8N_ACTIVE_EXECUTIONS_PATH);
    const { createRunExecutionData } = require(n8n_paths_1.N8N_WORKFLOW_PATH);
    const { WorkflowPublishedDataService } = require(n8n_paths_1.N8N_WORKFLOW_PUBLISHED_DATA_PATH);
    const runner = container.get(WorkflowRunner);
    const activeExecutions = container.get(ActiveExecutions);
    const publishedData = container.get(WorkflowPublishedDataService);
    if (typeof createRunExecutionData !== 'function' || typeof runner?.run !== 'function') {
      throw new TypeError('n8n WorkflowRunner / createRunExecutionData has an unexpected shape');
    }
    const usePublicationService = isPublicationServiceEnabled(container);
    log.info('WIL Trigger runner ready', { usePublicationService });
    const loadPublished = async (workflowId) => {
      if (usePublicationService) {
        const data = await publishedData.getPublishedWorkflowData(workflowId);
        if (!data || data.workflow.isArchived) return null;
        return toPublishedWorkflow(data.workflow, data.publishedVersion);
      }
      const entity = await n8nRepositories.workflow.findWithActiveVersion(workflowId);
      if (!entity?.activeVersion || entity.isArchived) return null;
      return toPublishedWorkflow(entity, entity.activeVersion);
    };
    return new N8nWorkflowRunnerService({
      runner,
      activeExecutions,
      createRunExecutionData,
      loadPublished,
      usePublicationService,
      findFinishedRun: async (executionId) => await n8nRepositories.execution.findWithData(executionId),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('WIL Trigger runner unavailable: n8n internals could not be resolved', { reason });
    return new N8nWorkflowRunnerService(null, 'Starting workflows from WIL is unavailable on this n8n version');
  }
}
