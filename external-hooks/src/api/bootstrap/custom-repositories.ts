import { drizzle } from 'drizzle-orm/node-postgres';
import { ActionRequestRepository } from '../../db/repository/custom/action-request';
import { MessageRepository } from '../../db/repository/custom/message';
import { TenantProjectRelationRepository } from '../../db/repository/custom/tenant-project-relation';
import { CustomRepositoryService } from '../services/custom-repository';

export function buildCustomRepositoryService(databaseUrl: string): CustomRepositoryService {
  const db = drizzle(databaseUrl);

  return new CustomRepositoryService({
    tenantProjectRelation: new TenantProjectRelationRepository(db),
    message: new MessageRepository(db),
    actionRequest: new ActionRequestRepository(db),
  });
}
