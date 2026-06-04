import { drizzle } from 'drizzle-orm/node-postgres';
import { ActionRequestRepository } from '../../db/repository/custom/action-request';
import { MessageRepository } from '../../db/repository/custom/message';
import { TenantProjectRelationRepository } from '../../db/repository/custom/tenant-project-relation';

export type CustomRepositories = {
  readonly tenantProjectRelation: TenantProjectRelationRepository;
  readonly message: MessageRepository;
  readonly actionRequest: ActionRequestRepository;
};

export function buildCustomRepositories(databaseUrl: string): CustomRepositories {
  const db = drizzle(databaseUrl);

  return {
    tenantProjectRelation: new TenantProjectRelationRepository(db),
    message: new MessageRepository(db),
    actionRequest: new ActionRequestRepository(db),
  };
}
