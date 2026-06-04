import type { N8nUser } from '../../db/repository/n8n/user';
import type {
  N8nProjectRecord,
  N8nProjectRepository,
  N8nProjectRelationRepository,
  N8nSharedWorkflowRepository,
  N8nUserRepository,
  N8nWorkflowRepository,
} from './n8n-adapters';

type UiWorkflowProjectShare = {
  projectId: string;
  userEmails: string[];
};

export type UiWorkflowSummary = {
  workflowId: string;
  workflowName: string;
  projectIds: string[];
  userEmails: string[];
  projectShares: UiWorkflowProjectShare[];
};

export type UiApiContext = {
  n8nUser: N8nUser | null;
  accessibleProjectIds: string[];
  projects: N8nProjectRecord[];
  workflows: UiWorkflowSummary[];
};

export type UiApiRepositories = {
  user: N8nUserRepository;
  project: N8nProjectRepository;
  projectRelation: N8nProjectRelationRepository;
  workflow: N8nWorkflowRepository;
  sharedWorkflow: N8nSharedWorkflowRepository;
};

export type WorkflowRow = {
  workflowId: string;
  workflowName: string;
  projectId: string;
};
