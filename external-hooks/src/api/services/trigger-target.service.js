"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TriggerTargetService = void 0;
const _config_1 = require("@config");
const wil_trigger_node_1 = require("../helpers/wil-trigger-node");
/**
 * Discovery and validation of n8n workflows that expose a WIL Trigger node.
 * Everything is derived from n8n's own published versions; WIL stores only (workflowId, nodeId).
 */
class TriggerTargetService {
    n8nRepositories;
    runner;
    constructor(n8nRepositories, runner) {
        this.n8nRepositories = n8nRepositories;
        this.runner = runner;
    }
    /** Published workflows (owned by `projectIds`) with a WIL Trigger node, optionally filtered by accepted source. */
    async list(params) {
        const rows = await this.n8nRepositories.sharedWorkflow.findPublishedWithNodeType({
            projectIds: params.projectIds,
            nodeTypes: _config_1.WIL_TRIGGER_NODE_TYPES,
            usePublicationService: this.runner.usesPublicationService,
        });
        return rows
            .flatMap((row) => (0, wil_trigger_node_1.extractWilTriggerNodes)(row.nodes)
            .filter((info) => !params.source || info.acceptedSources.includes(params.source))
            .map((info) => ({
            ...info,
            workflowId: row.workflowId,
            workflowName: row.workflowName,
            projectId: row.projectId,
        })))
            .sort((a, b) => a.label.localeCompare(b.label) || a.workflowName.localeCompare(b.workflowName));
    }
    /**
     * Loads and validates one target against the live published version.
     * `wrong-project` is deliberately indistinguishable from `unpublished` for callers (no existence leak).
     */
    async resolve(params) {
        const published = await this.runner.loadPublished(params.workflowId);
        if (!published)
            return { ok: false, reason: 'unpublished' };
        if (!published.projectId || !params.projectIds.includes(published.projectId)) {
            return { ok: false, reason: 'wrong-project' };
        }
        const info = (0, wil_trigger_node_1.findWilTriggerNode)(published.workflow.nodes, params.nodeId);
        if (!info)
            return { ok: false, reason: 'missing-node' };
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
     *
     * Discovery is scoped to every project in the tenant (`allowedProjectIds`), not the trigger's stored
     * `projectId`: a target may be owned by any tenant project (create validates against all of them but stores
     * only the first), so scoping to the stored id alone would report a working cross-project target as
     * `unpublished`. The adapter still matches on the owning project + `workflow:owner`, so the owner-project
     * guard is preserved.
     */
    async statuses(triggers, allowedProjectIds) {
        const result = new Map();
        const withTarget = triggers.filter((trigger) => trigger.targetWorkflowId && trigger.targetNodeId);
        if (withTarget.length === 0)
            return result;
        const rows = await this.n8nRepositories.sharedWorkflow.findPublishedWithNodeType({
            projectIds: allowedProjectIds,
            nodeTypes: _config_1.WIL_TRIGGER_NODE_TYPES,
            usePublicationService: this.runner.usesPublicationService,
        });
        const nodeIdsByWorkflow = new Map();
        for (const row of rows) {
            nodeIdsByWorkflow.set(row.workflowId, new Set((0, wil_trigger_node_1.extractWilTriggerNodes)(row.nodes).map((info) => info.nodeId)));
        }
        for (const trigger of withTarget) {
            const nodeIds = nodeIdsByWorkflow.get(trigger.targetWorkflowId);
            if (!nodeIds)
                result.set(trigger.id, 'unpublished');
            else
                result.set(trigger.id, nodeIds.has(trigger.targetNodeId) ? 'live' : 'missing-node');
        }
        return result;
    }
}
exports.TriggerTargetService = TriggerTargetService;
