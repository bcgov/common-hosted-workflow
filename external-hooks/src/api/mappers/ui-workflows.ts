import type { UiWorkflowSummary, WorkflowRow } from '../types/ui-api';

function normalizeEmailSet(values: Set<string>) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function buildWorkflowSummary(
  workflowId: string,
  workflowName: string,
  projectIds: Set<string>,
  projectEmailMap: Map<string, Set<string>>,
): UiWorkflowSummary {
  const userEmails = new Set<string>();
  const projectShares = [...projectIds].map((projectId) => {
    const emails = normalizeEmailSet(projectEmailMap.get(projectId) ?? new Set<string>());
    for (const emailValue of emails) userEmails.add(emailValue);
    return { projectId, userEmails: emails };
  });

  return {
    workflowId,
    workflowName,
    projectIds: [...projectIds],
    userEmails: normalizeEmailSet(userEmails),
    projectShares,
  };
}

export function buildWorkflowSummaries(
  workflowRows: WorkflowRow[],
  projectEmailMap: Map<string, Set<string>>,
): UiWorkflowSummary[] {
  const workflowMap = new Map<string, { workflowName: string; projectIds: Set<string> }>();
  for (const row of workflowRows) {
    const entry = workflowMap.get(row.workflowId) ?? {
      workflowName: row.workflowName || row.workflowId,
      projectIds: new Set<string>(),
    };
    entry.projectIds.add(row.projectId);
    workflowMap.set(row.workflowId, entry);
  }

  return [...workflowMap.entries()].map(([workflowId, entry]) =>
    buildWorkflowSummary(workflowId, entry.workflowName, entry.projectIds, projectEmailMap),
  );
}
