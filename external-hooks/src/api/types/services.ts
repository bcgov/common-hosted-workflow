import type { N8nUser } from './user';
import type { N8nProjectRecord } from './n8n-adapters';
import type { UiApiContext, UiWorkflowSummary } from './ui-api';
import type { AccessRequestService } from '../services/access-request';
import type { ActionService } from '../services/action.service';
import type { ChefsService } from '../services/chefs.service';
import type { CstarService } from '../services/cstar.service';
import type { FeatureFlagService } from '../services/feature-flag.service';
import type { MessageService } from '../services/message.service';
import type { ProjectTenantService } from '../services/project-tenant.service';
import type { TenantService } from '../services/tenant.service';
import type { TenantProjectSyncService } from '../services/tenant-project-sync.service';

export type N8nUiUser = N8nUser;

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
  ensureCredentialsSharedWithProject: (credentialIds: string[], projectId: string) => Promise<void>;
};

export type ApiServices = {
  uiApi: UiApiServiceContract;
  action: ActionService;
  chefs: ChefsService;
  cstar: CstarService;
  featureFlag: FeatureFlagService;
  message: MessageService;
  accessRequest: AccessRequestService;
  tenant: TenantService;
  tenantProjectSync: TenantProjectSyncService;
  projectTenant: ProjectTenantService;
};
