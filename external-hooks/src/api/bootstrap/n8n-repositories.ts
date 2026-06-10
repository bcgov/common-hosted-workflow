import { N8N_DB_PATH, N8N_DI_PATH } from '../constants/n8n-paths';
import { CredentialRepository } from '../../db/repository/n8n/credential';
import { ExecutionRepository } from '../../db/repository/n8n/execution';
import { ProjectRelationRepository } from '../../db/repository/n8n/project-relation';
import { ProjectRepository } from '../../db/repository/n8n/project';
import { SharedCredentialRepository } from '../../db/repository/n8n/shared-credential';
import { SharedWorkflowRepository } from '../../db/repository/n8n/shared-workflow';
import { UserRepository } from '../../db/repository/n8n/user';
import { WorkflowRepository } from '../../db/repository/n8n/workflow';
import type {
  BaseN8nCredentialRepository,
  BaseN8nExecutionRepository,
  BaseN8nProjectRelationRepository,
  BaseN8nProjectRepository,
  BaseN8nRepositories,
  BaseN8nSharedCredentialRepository,
  BaseN8nSharedWorkflowRepository,
  BaseN8nUserRepository,
  N8nWithTransaction,
  BaseN8nWorkflowRepository,
} from '../types/n8n-adapters';

export type N8nContainer = {
  get<T>(service: unknown): T;
};

type N8nDbModule = {
  withTransaction: N8nWithTransaction;
  UserRepository: unknown;
  ProjectRepository: unknown;
  ProjectRelationRepository: unknown;
  WorkflowRepository: unknown;
  SharedWorkflowRepository: unknown;
  CredentialsRepository: unknown;
  SharedCredentialsRepository: unknown;
  ExecutionRepository: unknown;
  GLOBAL_OWNER_ROLE: { slug: string };
  GLOBAL_ADMIN_ROLE: { slug: string };
};

export type N8nRepositories = {
  readonly user: UserRepository;
  readonly project: ProjectRepository;
  readonly projectRelation: ProjectRelationRepository;
  readonly sharedWorkflow: SharedWorkflowRepository;
  readonly workflow: WorkflowRepository;
  readonly credential: CredentialRepository;
  readonly sharedCredential: SharedCredentialRepository;
  readonly execution: ExecutionRepository;
  readonly withTransaction: N8nWithTransaction;
  readonly raw: BaseN8nRepositories;
};

export type N8nRuntimeContext = {
  container: N8nContainer;
  n8nRepositories: N8nRepositories;
  globalOwnerRoleSlug: string;
  globalAdminRoleSlug: string;
};

export function buildN8nRuntimeContext(): N8nRuntimeContext {
  const { Container } = require(N8N_DI_PATH) as { Container: N8nContainer };
  const {
    withTransaction,
    UserRepository: BaseUserRepository,
    ProjectRepository: BaseProjectRepository,
    ProjectRelationRepository: BaseProjectRelationRepository,
    WorkflowRepository: BaseWorkflowRepository,
    SharedWorkflowRepository: BaseSharedWorkflowRepository,
    CredentialsRepository: BaseCredentialsRepository,
    SharedCredentialsRepository: BaseSharedCredentialsRepository,
    ExecutionRepository: BaseExecutionRepository,
    GLOBAL_OWNER_ROLE,
    GLOBAL_ADMIN_ROLE,
  } = require(N8N_DB_PATH) as N8nDbModule;

  const raw: BaseN8nRepositories = {
    user: Container.get(BaseUserRepository) as BaseN8nUserRepository,
    project: Container.get(BaseProjectRepository) as BaseN8nProjectRepository,
    projectRelation: Container.get(BaseProjectRelationRepository) as BaseN8nProjectRelationRepository,
    workflow: Container.get(BaseWorkflowRepository) as BaseN8nWorkflowRepository,
    sharedWorkflow: Container.get(BaseSharedWorkflowRepository) as BaseN8nSharedWorkflowRepository,
    credential: Container.get(BaseCredentialsRepository) as BaseN8nCredentialRepository,
    sharedCredential: Container.get(BaseSharedCredentialsRepository) as BaseN8nSharedCredentialRepository,
    execution: Container.get(BaseExecutionRepository) as BaseN8nExecutionRepository,
    withTransaction,
  };

  const n8nRepositories: N8nRepositories = {
    user: new UserRepository(raw.user),
    project: new ProjectRepository(raw.project),
    projectRelation: new ProjectRelationRepository(raw.projectRelation, raw.user.metadata),
    workflow: new WorkflowRepository(raw.workflow),
    sharedWorkflow: new SharedWorkflowRepository(raw.sharedWorkflow, raw.workflow.metadata),
    credential: new CredentialRepository(raw.credential),
    sharedCredential: new SharedCredentialRepository(raw.sharedCredential),
    execution: new ExecutionRepository(raw.execution),
    withTransaction: raw.withTransaction,
    raw,
  };

  return {
    container: Container,
    n8nRepositories,
    globalOwnerRoleSlug: GLOBAL_OWNER_ROLE.slug,
    globalAdminRoleSlug: GLOBAL_ADMIN_ROLE.slug,
  };
}
