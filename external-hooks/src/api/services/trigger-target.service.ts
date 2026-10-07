import { WIL_TRIGGER_NODE_TYPES } from '@config';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { TriggerTargetStatus, WilTriggerSource } from '../constants/enum';
import { extractWilTriggerNodes, findWilTriggerNode, type WilTriggerNodeInfo } from '../helpers/wil-trigger-node';
import type { N8nWorkflowRunnerService, PublishedWorkflow } from './n8n-workflow-runner.service';

/** A WIL Trigger node in a published workflow that a WIL trigger can point at. */
export type TriggerTarget = WilTriggerNodeInfo & {
  workflowId: string;
  workflowName: string;
  projectId: string;
};

export type ResolvedTarget =
  | { ok: true; target: TriggerTarget; published: PublishedWorkflow }
  | { ok: false; reason: 'unpublished' | 'wrong-project' | 'missing-node' | 'source-not-accepted' };

export type TriggerTargetRef = {
  id: string;
  projectId: string;
  targetWorkflowId: string | null;
  targetNodeId: string | null;
};

/**
 * Discovery and validation of n8n workflows that expose a WIL Trigger node.
 * Everything is derived from n8n's own published versions; WIL stores only (workflowId, nodeId).
 */
export class TriggerTargetService {
  constructor(
    private readonly n8nRepositories: N8nRepositories,
    private readonly runner: N8nWorkflowRunnerService,
  ) {}

  /** Published workflows (owned by `projectIds`) with a WIL Trigger node, optionally filtered by accepted source. */
  async list(params: { projectIds: string[]; source?: WilTriggerSource }): Promise<TriggerTarget[]> {
    const rows = await this.n8nRepositories.sharedWorkflow.findPublishedWithNodeType({
      projectIds: params.projectIds,
      nodeTypes: WIL_TRIGGER_NODE_TYPES,
      usePublicationService: this.runner.usesPublicationService,
    });

    return rows
      .flatMap((row) =>
        extractWilTriggerNodes(row.nodes)
          .filter((info) => !params.source || info.acceptedSources.includes(params.source))
          .map((info) => ({
            ...info,
            workflowId: row.workflowId,
            workflowName: row.workflowName,
            projectId: row.projectId,
          })),
      )
      .sort((a, b) => a.label.localeCompare(b.label) || a.workflowName.localeCompare(b.workflowName));
  }

  /**
   * Loads and validates one target against the live published version.
   * `wrong-project` is deliberately indistinguishable from `unpublished` for callers (no existence leak).
   */
  async resolve(params: {
    workflowId: string;
    nodeId: string;
    projectIds: string[];
    source?: WilTriggerSource;
  }): Promise<ResolvedTarget> {
    const published = await this.runner.loadPublished(params.workflowId);
    if (!published) return { ok: false, reason: 'unpublished' };
    if (!published.projectId || !params.projectIds.includes(published.projectId)) {
      return { ok: false, reason: 'wrong-project' };
    }

    const info = findWilTriggerNode(published.workflow.nodes, params.nodeId);
    if (!info) return { ok: false, reason: 'missing-node' };
    if (params.source && !info.acceptedSources.includes(params.source)) {
      return { ok: false, reason: 'source-not-accepted' };
    }

    return {
      ok: true,
      published,
      target: {
        ...info,
        workflowId: params.workflowId,
        workflowName: published.workflow.name,
        projectId: published.projectId,
      },
    };
  }

  /**
   * Live status per trigger using ONE discovery query for all of them (no per-row loads).
   * `unpublished` also covers archived/deleted workflows and workflows that no longer contain any WIL node.
   */
  async statuses(triggers: TriggerTargetRef[]): Promise<Map<string, TriggerTargetStatus>> {
    const result = new Map<string, TriggerTargetStatus>();
    const withTarget = triggers.filter((trigger) => trigger.targetWorkflowId && trigger.targetNodeId);
    if (withTarget.length === 0) return result;

    const rows = await this.n8nRepositories.sharedWorkflow.findPublishedWithNodeType({
      projectIds: [...new Set(withTarget.map((trigger) => trigger.projectId))],
      nodeTypes: WIL_TRIGGER_NODE_TYPES,
      usePublicationService: this.runner.usesPublicationService,
    });

    const nodeIdsByWorkflow = new Map<string, Set<string>>();
    for (const row of rows) {
      nodeIdsByWorkflow.set(row.workflowId, new Set(extractWilTriggerNodes(row.nodes).map((info) => info.nodeId)));
    }

    for (const trigger of withTarget) {
      const nodeIds = nodeIdsByWorkflow.get(trigger.targetWorkflowId as string);
      if (!nodeIds) result.set(trigger.id, 'unpublished');
      else result.set(trigger.id, nodeIds.has(trigger.targetNodeId as string) ? 'live' : 'missing-node');
    }
    return result;
  }
}
