'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildWorkflowSummaries = buildWorkflowSummaries;
function normalizeEmailSet(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}
function buildWorkflowSummary(workflowId, workflowName, projectIds, projectEmailMap) {
  const userEmails = new Set();
  const projectShares = [...projectIds].map((projectId) => {
    const emails = normalizeEmailSet(projectEmailMap.get(projectId) ?? new Set());
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
function buildWorkflowSummaries(workflowRows, projectEmailMap) {
  const workflowMap = new Map();
  for (const row of workflowRows) {
    const entry = workflowMap.get(row.workflowId) ?? {
      workflowName: row.workflowName || row.workflowId,
      projectIds: new Set(),
    };
    entry.projectIds.add(row.projectId);
    workflowMap.set(row.workflowId, entry);
  }
  return [...workflowMap.entries()].map(([workflowId, entry]) =>
    buildWorkflowSummary(workflowId, entry.workflowName, entry.projectIds, projectEmailMap),
  );
}
