import { drizzle } from 'drizzle-orm/node-postgres';
import { ActionRequestRepository } from '../../db/repository/workflow-interaction-layer/action-request';
import { MessageRepository } from '../../db/repository/workflow-interaction-layer/message';
import { TenantProjectRelationRepository } from '../../db/repository/workflow-interaction-layer/tenant-project-relation';
import type { CustomRepositories } from '../types/repositories';

export function buildCustomRepositories(databaseUrl: string): CustomRepositories {
  const db = drizzle(databaseUrl);

  return {
    tenantProjectRelation: new TenantProjectRelationRepository(db),
    message: new MessageRepository(db),
    actionRequest: new ActionRequestRepository(db),
  };
}
