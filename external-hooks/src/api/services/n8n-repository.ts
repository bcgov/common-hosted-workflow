import { UserRepository } from '../../db/repository/n8n/user';
import { ProjectRepository } from '../../db/repository/n8n/project';
import { ProjectRelationRepository } from '../../db/repository/n8n/project-relation';
import { SharedWorkflowRepository } from '../../db/repository/n8n/shared-workflow';
import { WorkflowRepository } from '../../db/repository/n8n/workflow';
import { CredentialRepository } from '../../db/repository/n8n/credential';
import { SharedCredentialRepository } from '../../db/repository/n8n/shared-credential';
import { ExecutionRepository } from '../../db/repository/n8n/execution';
import type { N8nRepositories, N8nWithTransaction } from '../types/n8n-adapters';

export type N8nRepositoryServiceContract = {
  readonly user: UserRepository;
  readonly project: ProjectRepository;
  readonly projectRelation: ProjectRelationRepository;
  readonly sharedWorkflow: SharedWorkflowRepository;
  readonly workflow: WorkflowRepository;
  readonly credential: CredentialRepository;
  readonly sharedCredential: SharedCredentialRepository;
  readonly execution: ExecutionRepository;
  readonly withTransaction: N8nWithTransaction;
  readonly raw: N8nRepositories;
};

export class N8nRepositoryService implements N8nRepositoryServiceContract {
  readonly user: UserRepository;
  readonly project: ProjectRepository;
  readonly projectRelation: ProjectRelationRepository;
  readonly sharedWorkflow: SharedWorkflowRepository;
  readonly workflow: WorkflowRepository;
  readonly credential: CredentialRepository;
  readonly sharedCredential: SharedCredentialRepository;
  readonly execution: ExecutionRepository;
  readonly withTransaction: N8nWithTransaction;
  readonly raw: N8nRepositories;

  constructor(repositories: N8nRepositories) {
    this.raw = repositories;
    this.user = new UserRepository(repositories.user);
    this.project = new ProjectRepository(repositories.project);
    this.projectRelation = new ProjectRelationRepository(repositories.projectRelation, repositories.user.metadata);
    this.workflow = new WorkflowRepository(repositories.workflow);
    this.sharedWorkflow = new SharedWorkflowRepository(repositories.sharedWorkflow, repositories.workflow.metadata);
    this.credential = new CredentialRepository(repositories.credential);
    this.sharedCredential = new SharedCredentialRepository(repositories.sharedCredential);
    this.execution = new ExecutionRepository(repositories.execution);
    this.withTransaction = repositories.withTransaction;
  }
}
