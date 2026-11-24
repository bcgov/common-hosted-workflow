import type { TemplateLibrary } from './library';
import type { TemplateCollection, TemplateRecord, TemplateWorkflowGraph } from './schema';

/**
 * Response projections for the templates API.
 *
 * One record on disk feeds three different wire shapes:
 *  - list item       → `/templates/search`, collection `workflows`
 *  - detail (wrapped) → `/templates/workflows/:id`, `/templates/collections/:id`
 *  - import (flat)    → `/workflows/templates/:id`
 */

export interface TemplateListItem {
  id: number;
  name: string;
  totalViews: number;
  createdAt: string;
  user: TemplateRecord['user'];
  nodes: TemplateRecord['nodes'];
}

export function toTemplateListItem(template: TemplateRecord): TemplateListItem {
  return {
    id: template.id,
    name: template.name,
    totalViews: template.totalViews,
    createdAt: template.createdAt,
    user: template.user,
    nodes: template.nodes,
  };
}

function buildWorkflowInfo(workflow: TemplateWorkflowGraph) {
  const nodeTypes: Record<string, { count: number }> = {};
  let nodeCount = 0;

  for (const node of workflow.nodes) {
    // Sticky notes are canvas decoration, not part of the workflow logic.
    if (node.type === 'n8n-nodes-base.stickyNote') continue;
    nodeCount += 1;
    nodeTypes[node.type] = { count: (nodeTypes[node.type]?.count ?? 0) + 1 };
  }

  return { nodeCount, nodeTypes };
}

/** Detail projection. Note the outer `workflow` wrapper — the UI reads `response.workflow`. */
export function toTemplateDetail(template: TemplateRecord) {
  return {
    id: template.id,
    name: template.name,
    views: template.totalViews,
    recentViews: 0,
    totalViews: template.totalViews,
    createdAt: template.createdAt,
    description: template.description,
    workflow: template.workflow,
    lastUpdatedBy: template.user.username,
    workflowInfo: buildWorkflowInfo(template.workflow),
    status: 'published',
    reviewStatus: 'approved',
    readyToDemo: false,
    user: template.user,
    nodes: template.nodes,
    categories: template.categories,
    image: template.image,
  };
}

/** Import payload. Flat on purpose: `{ id, name, workflow }`, no wrapper. */
export function toTemplateImport(template: TemplateRecord) {
  const { nodes, connections, settings } = template.workflow;

  return {
    id: template.id,
    name: template.name,
    workflow: {
      nodes,
      connections,
      ...(settings ? { settings } : {}),
    },
  };
}

export function toCollectionListItem(collection: TemplateCollection) {
  return {
    id: collection.id,
    rank: collection.rank ?? 0,
    name: collection.name,
    totalViews: collection.totalViews,
    createdAt: collection.createdAt,
    workflows: collection.workflowIds.map((id) => ({ id })),
    nodes: collection.nodes,
  };
}

/** Collection detail: `workflows` becomes full detail projections, not `{ id }` stubs. */
export function toCollectionDetail(collection: TemplateCollection, library: TemplateLibrary) {
  return {
    ...toCollectionListItem(collection),
    description: collection.description,
    categories: collection.categories,
    image: collection.image,
    workflows: collection.workflowIds
      .map((id) => library.templatesById.get(id))
      .filter((template): template is TemplateRecord => template !== undefined)
      .map(toTemplateDetail),
  };
}
