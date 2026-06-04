import type { TenantProjectRelationRepository } from '../../db/repository/custom/tenant-project-relation';
import type { MessageRepository } from '../../db/repository/custom/message';
import type { ActionRequestRepository } from '../../db/repository/custom/action-request';

export type CustomRepositoryServiceContract = {
  readonly tenantProjectRelation: TenantProjectRelationRepository;
  readonly message: MessageRepository;
  readonly actionRequest: ActionRequestRepository;
};

export class CustomRepositoryService implements CustomRepositoryServiceContract {
  readonly tenantProjectRelation: TenantProjectRelationRepository;
  readonly message: MessageRepository;
  readonly actionRequest: ActionRequestRepository;

  constructor(repositories: {
    tenantProjectRelation: TenantProjectRelationRepository;
    message: MessageRepository;
    actionRequest: ActionRequestRepository;
  }) {
    this.tenantProjectRelation = repositories.tenantProjectRelation;
    this.message = repositories.message;
    this.actionRequest = repositories.actionRequest;
  }
}
