import { drizzle } from 'drizzle-orm/node-postgres';
import { ActionRequestRepository } from '../../db/repository/custom/action-request';
import { AccessRequestRepository } from '../../db/repository/custom/access-request';
import { CredentialEntityRepository } from '../../db/repository/custom/credential-entity';
import { MessageRepository } from '../../db/repository/custom/message';
import { TenantProjectRelationRepository } from '../../db/repository/custom/tenant-project-relation';
import { TriggerCredentialRelationRepository } from '../../db/repository/custom/trigger-credential-relation';
import { WorkflowTriggerRepository } from '../../db/repository/custom/workflow-trigger';

export type CustomRepositories = {
  readonly tenantProjectRelation: TenantProjectRelationRepository;
  readonly message: MessageRepository;
  readonly actionRequest: ActionRequestRepository;
  readonly accessRequest: AccessRequestRepository;
  readonly workflowTrigger: WorkflowTriggerRepository;
  readonly credentialEntity: CredentialEntityRepository;
  readonly triggerCredentialRelation: TriggerCredentialRelationRepository;
};

export function buildCustomRepositories(databaseUrl: string): CustomRepositories {
  const db = drizzle(databaseUrl);

  return {
    tenantProjectRelation: new TenantProjectRelationRepository(db),
    message: new MessageRepository(db),
    actionRequest: new ActionRequestRepository(db),
    accessRequest: new AccessRequestRepository(db),
    workflowTrigger: new WorkflowTriggerRepository(db),
    credentialEntity: new CredentialEntityRepository(db),
    triggerCredentialRelation: new TriggerCredentialRelationRepository(db),
  };
}
