import { instance } from './axios';

export type WorkflowSummary = {
  workflowId: string;
  workflowName: string;
  projectIds: string[];
  userEmails: string[];
  projectShares: Array<{
    projectId: string;
    userEmails: string[];
  }>;
};

export type ShareWorkflowResponse = {
  workflowId: string;
  sharedWithEmail: string;
};

export type UnshareWorkflowResponse = {
  workflowId: string;
  projectId: string;
};

export function getWorkflows(params?: { signal?: AbortSignal }) {
  return instance.get<WorkflowSummary[]>('/ui-api/workflows', { signal: params?.signal }).then((res) => res.data);
}

export function shareWorkflow(workflowId: string, email: string) {
  return instance
    .post<ShareWorkflowResponse>(`/ui-api/workflows/${encodeURIComponent(workflowId)}/share`, { email })
    .then((res) => res.data);
}

export function unshareWorkflow(workflowId: string, projectId: string) {
  return instance
    .delete<UnshareWorkflowResponse>(
      `/ui-api/workflows/${encodeURIComponent(workflowId)}/projects/${encodeURIComponent(projectId)}`,
    )
    .then((res) => res.data);
}
