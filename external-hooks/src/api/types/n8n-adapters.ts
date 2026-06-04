import type { N8nUser } from '../../db/repository/n8n/user';
import type { User } from './user';

export type N8nEntityRecord = Record<string, unknown> & { id: string };
export type N8nUserRecord = Record<string, unknown> & { id: string; email: string };
export type N8nProjectRecord = N8nEntityRecord & {
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  icon: string | null;
  description: string | null;
  creatorId: string | null;
};

export type EntityMetadataLike = {
  tableName: string;
  columns: Array<{
    propertyName: string;
    databaseName: string;
  }>;
};

export type N8nRepositoryManager = {
  query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
} & Record<string, unknown>;

export type N8nRepository = {
  metadata: EntityMetadataLike;
  manager: N8nRepositoryManager;
};

export type N8nUserRepository = N8nRepository & {
  findOne: (options: {
    where:
      | {
          apiKeys: {
            apiKey: string;
            audience: string;
          };
        }
      | { email: string };
    relations?: string[];
  }) => Promise<N8nUser | User | null>;
  findOneBy: (where: { email: string }) => Promise<N8nUserRecord | null>;
};

export type N8nProjectRepository = N8nRepository & {
  findOneBy: (where: { id: string }) => Promise<N8nProjectRecord | null>;
  getPersonalProjectForUser: (userId: string) => Promise<N8nProjectRecord | null>;
  getPersonalProjectForUserOrFail: (userId: string) => Promise<N8nProjectRecord>;
};

export type N8nProjectRelationRepository = N8nRepository & {
  findProjectRole: (args: { userId: string; projectId: string }) => Promise<unknown>;
  findAllByUser: (userId: string) => Promise<Array<{ projectId: string }>>;
};

export type N8nWorkflowRepository = N8nRepository & {
  findOneBy: (where: { id: string }) => Promise<N8nEntityRecord | null>;
};

export type N8nCredentialRepository = N8nRepository & {
  findOneBy: (where: { id: string }) => Promise<N8nEntityRecord | null>;
};

export type N8nRepositoryEntityManager = {
  delete: (entityName: string, criteria: unknown) => Promise<unknown>;
  create: (entityName: string, payload: Record<string, unknown>) => Record<string, unknown>;
  save: (value: unknown) => Promise<unknown>;
};

export type N8nWithTransaction = (
  manager: Record<string, unknown>,
  context: unknown,
  handler: (entityManager: N8nRepositoryEntityManager) => Promise<void>,
) => Promise<void>;

export type N8nSharedWorkflowRepository = N8nRepository & {
  findProjectIds: (workflowId: string) => Promise<string[]>;
  create: (value: Record<string, unknown>) => Record<string, unknown>;
  save: (value: Record<string, unknown>) => Promise<unknown>;
  delete: (criteria: Record<string, unknown>) => Promise<unknown>;
};

export type N8nExecutionRepository = N8nRepository & {
  findSingleExecution: (
    id: string,
    options?: { includeData?: boolean; unflattenData?: boolean },
  ) => Promise<{ workflowId: string } | null | undefined>;
};

export type N8nSharedCredentialRepository = N8nRepository;

export type N8nRepositories = {
  user: N8nUserRepository;
  project: N8nProjectRepository;
  projectRelation: N8nProjectRelationRepository;
  workflow: N8nWorkflowRepository;
  credential: N8nCredentialRepository;
  sharedWorkflow: N8nSharedWorkflowRepository;
  sharedCredential: N8nSharedCredentialRepository;
  execution: N8nExecutionRepository;
  withTransaction: N8nWithTransaction;
};
