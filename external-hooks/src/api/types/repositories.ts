import type {
  MessageRepository,
  TenantProjectRelationRepository,
} from '../../db/repository/workflow-interaction-layer/message';

/** n8n DI-backed repositories and helpers (from Container / TypeORM). */
export type N8nRepositories = {
  user: any;
  project: any;
  projectRelation: any;
  workflow: any;
  sharedWorkflow: any;
  withTransaction: any;
};

/** Drizzle / custom DB repositories for CHWF tables. */
export type CustomRepositories = {
  tenantProjectRelation: TenantProjectRelationRepository;
  message: MessageRepository;
};
