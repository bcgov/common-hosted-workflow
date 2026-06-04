import type { N8nUiUser } from '../../db/repository/n8n/user';
import type { N8nProjectRecord } from './n8n-adapters';
import type { UiApiContext, UiWorkflowSummary } from './ui-api';
import type { ActionService } from '../services/action.service';
import type { MessageService } from '../services/message.service';

export type UiApiServiceContract = {
  getWhoami: (email?: string) => Promise<N8nUiUser | null>;
  loadUserContext: (email?: string) => Promise<UiApiContext>;
  getWorkflows: (email?: string) => Promise<{
    n8nUser: N8nUiUser | null;
    accessibleProjectIds: string[];
    projects: N8nProjectRecord[];
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
  uiApi: UiApiServiceContract;
  action: ActionService;
  message: MessageService;
};
