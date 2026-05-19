import { instance } from './axios';

export type WorkflowsResponse = {
  ok: boolean;
  route: string;
  method: string;
  n8nUser: {
    id: string;
    email: string;
    role: {
      slug: string;
      displayName: string;
    } | null;
  } | null;
  accessibleProjectIds: string[];
  workflows: Array<{
    workflowId: string;
    workflowName: string;
    projectIds: string[];
    userEmails: string[];
    projectShares: Array<{
      projectId: string;
      userEmails: string[];
    }>;
  }>;
};

export type ShareWorkflowResponse = {
  success: boolean;
  message: string;
  workflowId: string;
  sharedWithEmail: string;
};

export type UnshareWorkflowResponse = {
  success: boolean;
  message: string;
  workflowId: string;
  projectId: string;
};

export async function getWorkflows(params?: { signal?: AbortSignal }) {
  return instance.get<WorkflowsResponse>('/ui-api/workflows', { signal: params?.signal }).then((res) => res.data);
}

export async function shareWorkflow(workflowId: string, email: string) {
  return instance
    .post<ShareWorkflowResponse>(`/ui-api/workflows/${encodeURIComponent(workflowId)}/share`, { email })
    .then((res) => res.data);
}

export async function unshareWorkflow(workflowId: string, projectId: string) {
  return instance
    .delete<UnshareWorkflowResponse>(
      `/ui-api/workflows/${encodeURIComponent(workflowId)}/projects/${encodeURIComponent(projectId)}`,
    )
    .then((res) => res.data);
}
