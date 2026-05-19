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
  }>;
};

export async function getWorkflows(params?: { signal?: AbortSignal }) {
  return instance.get<WorkflowsResponse>('/ui-api/workflows', { signal: params?.signal }).then((res) => res.data);
}
