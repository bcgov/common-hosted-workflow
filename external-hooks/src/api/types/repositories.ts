import type { MessageRepository } from '../../db/repository/custom/message';
import type { TenantProjectRelationRepository } from '../../db/repository/custom/tenant-project-relation';
import type { ActionRequestRepository } from '../../db/repository/custom/action-request';
import type { N8nRepositories } from './n8n-adapters';

/** n8n DI-backed repositories and helpers (from Container / TypeORM). */
export type { N8nRepositories };

/** Drizzle / custom DB repositories for CHWF tables. */
export type CustomRepositories = {
  tenantProjectRelation: TenantProjectRelationRepository;
  message: MessageRepository;
  actionRequest: ActionRequestRepository;
};
