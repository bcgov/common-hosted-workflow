import {
  N8N_ACTIVE_EXECUTIONS_PATH,
  N8N_CONFIG_PATH,
  N8N_WORKFLOW_PATH,
  N8N_WORKFLOW_PUBLISHED_DATA_PATH,
  N8N_WORKFLOW_RUNNER_PATH,
} from '../constants/n8n-paths';
import type { N8nContainer, N8nRepositories } from '../bootstrap/n8n-repositories';
import type { IWorkflowBase } from '../types/hooks';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

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

const log = createLogger('N8nWorkflowRunner');

export const WIL_TARGET_UNAVAILABLE_CODE = 'WIL_TARGET_UNAVAILABLE';

/** Minimal shape of an n8n node as stored in a workflow version. */
export type N8nNodeLike = {
  id: string;
  name: string;
  type: string;
  disabled?: boolean;
  parameters?: Record<string, unknown>;
} & Record<string, unknown>;

export type PublishedWorkflow = {
  /** Workflow data (nodes/connections of the PUBLISHED version) in the shape `WorkflowRunner` expects. */
  workflow: IWorkflowBase & { nodes: N8nNodeLike[] };
  /** Owning project, used for execution project context. */
  projectId: string | null;
};

export type StartWorkflowParams = {
  published: PublishedWorkflow;
  /** n8n node id (not name) of the node the run starts at. */
  startNodeId: string;
  items: Array<{ json: Record<string, unknown> }>;
  /** When set, waits (up to `timeoutMs`) for the run to finish and returns the last node's output. */
  wait?: { timeoutMs: number };
};

export type StartWorkflowResult = {
  executionId: string;
  status: 'dispatched' | 'succeeded' | 'failed';
  /** Last executed node's output (single item → its json, several → array of json). Only on `succeeded`. */
  result?: unknown;
};

/** The parts of an n8n `IRun` / stored execution this module reads. */
export type RunSummary = {
  status?: string;
  finished?: boolean;
  data?: {
    resultData?: {
      lastNodeExecuted?: string;
      runData?: Record<
        string,
        Array<{ data?: { main?: Array<Array<{ json?: Record<string, unknown> }> | null | undefined> } }>
      >;
    };
  };
};

type RunnerLike = {
  run: (data: Record<string, unknown>, loadStaticData?: boolean) => Promise<string>;
};
type ActiveExecutionsLike = { getPostExecutePromise: (executionId: string) => Promise<RunSummary | undefined> };

export type N8nWorkflowRunnerDeps = {
  runner: RunnerLike;
  activeExecutions: ActiveExecutionsLike;
  createRunExecutionData: (value: Record<string, unknown>) => unknown;
  loadPublished: (workflowId: string) => Promise<PublishedWorkflow | null>;
  /** n8n's `N8N_USE_WORKFLOW_PUBLICATION_SERVICE`: which table holds the published version. */
  usePublicationService: boolean;
  /** Fallback when a run finished before its post-execute promise could be read. */
  findFinishedRun: (executionId: string) => Promise<RunSummary | null>;
};

function mapRunStatus(run: RunSummary): StartWorkflowResult['status'] {
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
export function extractLastNodeOutput(run: RunSummary): unknown {
  const resultData = run.data?.resultData;
  const lastNode = resultData?.lastNodeExecuted;
  if (!lastNode) return undefined;
  const taskRuns = resultData?.runData?.[lastNode];
  const items = taskRuns?.[taskRuns.length - 1]?.data?.main?.[0];
  if (!items?.length) return undefined;
  const jsons = items.map((item) => item.json ?? {});
  return jsons.length === 1 ? jsons[0] : jsons;
}

export class N8nWorkflowRunnerService {
  constructor(
    private readonly deps: N8nWorkflowRunnerDeps | null,
    private readonly unavailableReason = 'n8n workflow runner is not available',
  ) {}

  /** False when the n8n internals could not be resolved at startup (feature then answers 503). */
  get available(): boolean {
    return this.deps !== null;
  }

  /** Mirrors n8n's publication-service flag so discovery queries read the same table the runner does. */
  get usesPublicationService(): boolean {
    return this.deps?.usePublicationService ?? false;
  }

  private requireDeps(): N8nWorkflowRunnerDeps {
    if (!this.deps) throw new AppError(503, this.unavailableReason);
    return this.deps;
  }

  /** Loads the PUBLISHED version of a workflow, or null when unpublished/archived/missing. */
  async loadPublished(workflowId: string): Promise<PublishedWorkflow | null> {
    return await this.requireDeps().loadPublished(workflowId);
  }

  /** Starts a published workflow at `startNodeId` through n8n's normal production execution path. */
  async start(params: StartWorkflowParams): Promise<StartWorkflowResult> {
    const deps = this.requireDeps();
    const { published, startNodeId, items, wait } = params;

    const node = published.workflow.nodes.find((candidate) => candidate.id === startNodeId);
    if (!node) {
      throw new AppError(409, 'Workflow trigger node not found', { code: WIL_TARGET_UNAVAILABLE_CODE });
    }

    const executionData = deps.createRunExecutionData({
      executionData: { nodeExecutionStack: [{ node, data: { main: [items] }, source: null }] },
    });

    const runData: Record<string, unknown> = {
      executionMode: 'trigger',
      executionData,
      workflowData: published.workflow,
      ...(published.projectId ? { projectId: published.projectId } : {}),
      // Queue mode: main needs the full run data to read the last node's output.
      ...(wait ? { forceFullExecutionData: true } : {}),
    };

    let executionId: string;
    try {
      executionId = await deps.runner.run(runData, true);
    } catch (error) {
      log.error('Failed to start workflow execution', {
        workflowId: published.workflow.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError(502, 'Failed to start workflow');
    }

    if (!wait) return { executionId, status: 'dispatched' };
    return await this.awaitResult(deps, executionId, wait.timeoutMs);
  }

  private async awaitResult(
    deps: N8nWorkflowRunnerDeps,
    executionId: string,
    timeoutMs: number,
  ): Promise<StartWorkflowResult> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
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
  private async resolveRun(deps: N8nWorkflowRunnerDeps, executionId: string): Promise<RunSummary | null> {
    try {
      return (await deps.activeExecutions.getPostExecutePromise(executionId)) ?? null;
    } catch {
      return await deps.findFinishedRun(executionId);
    }
  }
}

type PublishedDataServiceLike = {
  getPublishedWorkflowData: (workflowId: string) => Promise<{
    workflow: Record<string, unknown> & { shared?: Array<{ projectId: string; role: string }> };
    publishedVersion: { versionId: string; nodes: N8nNodeLike[]; connections: unknown };
  } | null>;
};

type WorkflowEntityLike = Record<string, unknown> & {
  isArchived?: boolean;
  shared?: Array<{ projectId: string; role: string }>;
  activeVersion?: { versionId: string; nodes: N8nNodeLike[]; connections: unknown } | null;
};

const OWNER_ROLE = 'workflow:owner';

function ownerProjectId(shared: Array<{ projectId: string; role: string }> | undefined): string | null {
  return shared?.find((entry) => entry.role === OWNER_ROLE)?.projectId ?? null;
}

/** Same selection n8n's live webhooks use: `N8N_USE_WORKFLOW_PUBLICATION_SERVICE` decides the source. */
export function isPublicationServiceEnabled(container: N8nContainer): boolean {
  try {
    const { WorkflowsConfig } = require(N8N_CONFIG_PATH) as { WorkflowsConfig: unknown };
    return Boolean(
      container.get<{ useWorkflowPublicationService?: boolean }>(WorkflowsConfig).useWorkflowPublicationService,
    );
  } catch (error) {
    log.warn('Could not read WorkflowsConfig; falling back to env', {
      error: error instanceof Error ? error.message : String(error),
    });
    return process.env.N8N_USE_WORKFLOW_PUBLICATION_SERVICE === 'true';
  }
}

function toPublishedWorkflow(
  entity: Record<string, unknown> & { shared?: Array<{ projectId: string; role: string }> },
  version: { versionId: string; nodes: N8nNodeLike[]; connections: unknown },
): PublishedWorkflow {
  // Drop relation payloads; WorkflowRunner only needs the plain workflow fields + the published graph.
  const workflowFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (key !== 'shared' && key !== 'activeVersion') workflowFields[key] = value;
  }
  return {
    workflow: {
      ...workflowFields,
      nodes: version.nodes,
      connections: version.connections,
      versionId: version.versionId,
    } as PublishedWorkflow['workflow'],
    projectId: ownerProjectId(entity.shared),
  };
}

/**
 * Resolves n8n's runner classes from the running n8n process. Never throws: when n8n internals are missing
 * (e.g. after an upgrade) it logs a clear error and returns an unavailable service so n8n itself keeps booting.
 */
export function createN8nWorkflowRunnerService(
  container: N8nContainer,
  n8nRepositories: N8nRepositories,
): N8nWorkflowRunnerService {
  try {
    const { WorkflowRunner } = require(N8N_WORKFLOW_RUNNER_PATH) as { WorkflowRunner: unknown };
    const { ActiveExecutions } = require(N8N_ACTIVE_EXECUTIONS_PATH) as { ActiveExecutions: unknown };
    const { createRunExecutionData } = require(N8N_WORKFLOW_PATH) as {
      createRunExecutionData: N8nWorkflowRunnerDeps['createRunExecutionData'];
    };
    const { WorkflowPublishedDataService } = require(N8N_WORKFLOW_PUBLISHED_DATA_PATH) as {
      WorkflowPublishedDataService: unknown;
    };

    const runner = container.get<RunnerLike>(WorkflowRunner);
    const activeExecutions = container.get<ActiveExecutionsLike>(ActiveExecutions);
    const publishedData = container.get<PublishedDataServiceLike>(WorkflowPublishedDataService);
    if (typeof createRunExecutionData !== 'function' || typeof runner?.run !== 'function') {
      throw new TypeError('n8n WorkflowRunner / createRunExecutionData has an unexpected shape');
    }

    const usePublicationService = isPublicationServiceEnabled(container);
    log.info('WIL Trigger runner ready', { usePublicationService });

    const loadPublished = async (workflowId: string): Promise<PublishedWorkflow | null> => {
      if (usePublicationService) {
        const data = await publishedData.getPublishedWorkflowData(workflowId);
        if (!data || (data.workflow as WorkflowEntityLike).isArchived) return null;
        return toPublishedWorkflow(data.workflow, data.publishedVersion);
      }

      const entity = (await n8nRepositories.workflow.findWithActiveVersion(workflowId)) as WorkflowEntityLike | null;
      if (!entity?.activeVersion || entity.isArchived) return null;
      return toPublishedWorkflow(entity, entity.activeVersion);
    };

    return new N8nWorkflowRunnerService({
      runner,
      activeExecutions,
      createRunExecutionData,
      loadPublished,
      usePublicationService,
      findFinishedRun: async (executionId) =>
        (await n8nRepositories.execution.findWithData(executionId)) as RunSummary | null,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('WIL Trigger runner unavailable: n8n internals could not be resolved', { reason });
    return new N8nWorkflowRunnerService(null, 'Starting workflows from WIL is unavailable on this n8n version');
  }
}
