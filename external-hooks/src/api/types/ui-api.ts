import type { Request } from 'express';
import type { N8nUser } from './user';
import type { N8nProjectRecord } from './n8n-adapters';
import type { UiAuthenticatedSession } from '../helpers/ui-oidc';

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

export type WorkflowRow = {
  workflowId: string;
  workflowName: string;
  projectId: string;
};

export type UiApiRequest = Request & {
  session: UiAuthenticatedSession;
  context: UiApiContext;
};

export type UiApiTypedRequest<T> = UiApiRequest & {
  parsed: T;
};
