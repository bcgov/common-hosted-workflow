import type { MessageRepository } from '../../db/repository/workflow-interaction-layer/message';
import type { TenantProjectRelationRepository } from '../../db/repository/workflow-interaction-layer/tenant-project-relation';
import type { ActionRequestRepository } from '../../db/repository/workflow-interaction-layer/action-request';
import type { N8nExecutionLookup } from '../helpers/n8n-validation';

/** n8n DI-backed repositories and helpers (from Container / TypeORM). */
export type N8nRepositories = {
  user: any;
  project: any;
  projectRelation: any;
  workflow: any;
  sharedWorkflow: any;
  withTransaction: any;
  execution: N8nExecutionLookup;
};

/** Drizzle / custom DB repositories for CHWF tables. */
export type CustomRepositories = {
  tenantProjectRelation: TenantProjectRelationRepository;
  message: MessageRepository;
  actionRequest: ActionRequestRepository;
};
