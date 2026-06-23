import type { WorkflowNode } from '../types/hooks';

export function extractCredentialIds(nodes: WorkflowNode[]): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!node.credentials) continue;
    for (const cred of Object.values(node.credentials)) {
      if (cred?.id) ids.add(cred.id);
    }
  }
  return Array.from(ids);
}

export function getWorkflowNodes(workflow: unknown): WorkflowNode[] {
  if (!workflow || typeof workflow !== 'object') {
    return [];
  }

  const nodes = Reflect.get(workflow, 'nodes');
  return Array.isArray(nodes) ? (nodes as WorkflowNode[]) : [];
}
