import { N8N_DB_PATH, N8N_DI_PATH } from '../constants/n8n-paths';
import { N8nRepositoryService } from '../services/n8n-repository';
import type {
  N8nCredentialRepository,
  N8nExecutionRepository,
  N8nProjectRelationRepository,
  N8nProjectRepository,
  N8nRepositories,
  N8nSharedCredentialRepository,
  N8nSharedWorkflowRepository,
  N8nUserRepository,
  N8nWithTransaction,
  N8nWorkflowRepository,
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

export type N8nRuntimeContext = {
  container: N8nContainer;
  repositoryService: N8nRepositoryService;
  globalOwnerRoleSlug: string;
  globalAdminRoleSlug: string;
};

export function buildN8nRuntimeContext(): N8nRuntimeContext {
  const { Container } = require(N8N_DI_PATH) as { Container: N8nContainer };
  const {
    withTransaction,
    UserRepository,
    ProjectRepository,
    ProjectRelationRepository,
    WorkflowRepository,
    SharedWorkflowRepository,
    CredentialsRepository,
    SharedCredentialsRepository,
    ExecutionRepository,
    GLOBAL_OWNER_ROLE,
    GLOBAL_ADMIN_ROLE,
  } = require(N8N_DB_PATH) as N8nDbModule;

  const repositories: N8nRepositories = {
    user: Container.get(UserRepository) as N8nUserRepository,
    project: Container.get(ProjectRepository) as N8nProjectRepository,
    projectRelation: Container.get(ProjectRelationRepository) as N8nProjectRelationRepository,
    workflow: Container.get(WorkflowRepository) as N8nWorkflowRepository,
    sharedWorkflow: Container.get(SharedWorkflowRepository) as N8nSharedWorkflowRepository,
    credential: Container.get(CredentialsRepository) as N8nCredentialRepository,
    sharedCredential: Container.get(SharedCredentialsRepository) as N8nSharedCredentialRepository,
    execution: Container.get(ExecutionRepository) as N8nExecutionRepository,
    withTransaction,
  };

  const repositoryService = new N8nRepositoryService(repositories);

  return {
    container: Container,
    repositoryService,
    globalOwnerRoleSlug: GLOBAL_OWNER_ROLE.slug,
    globalAdminRoleSlug: GLOBAL_ADMIN_ROLE.slug,
  };
}
