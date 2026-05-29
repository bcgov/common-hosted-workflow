import type { User } from './user';
import type { N8nUiUser } from '../../db/repository/n8n/user';
import type { UiWorkflowSummary } from './ui-api';

export type ApiKeyLookupService = {
  getUserForApiKey: (token: string) => Promise<User | null>;
};

export type UiApiServiceContract = {
  getWhoami: (email?: string) => Promise<N8nUiUser | null>;
  getWorkflows: (email?: string) => Promise<{
    n8nUser: N8nUiUser | null;
    accessibleProjectIds: string[];
    workflows: UiWorkflowSummary[];
  }>;
  shareWorkflow: (
    email: string | undefined,
    workflowId: string,
    targetEmail: string,
  ) => Promise<{ workflowId: string; sharedWithEmail: string }>;
  unshareWorkflow: (
    email: string | undefined,
    workflowId: string,
    projectId: string,
  ) => Promise<{ workflowId: string; projectId: string }>;
};

export type ApiServices = {
  apiKey: ApiKeyLookupService;
  uiApi: UiApiServiceContract;
};
