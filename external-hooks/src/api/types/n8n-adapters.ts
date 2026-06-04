import type { N8nUser } from './user';

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

export type BaseN8nRepositoryManager = {
  query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
} & Record<string, unknown>;

export type BaseN8nRepository = {
  metadata: EntityMetadataLike;
  manager: BaseN8nRepositoryManager;
};

export type BaseN8nUserRepository = BaseN8nRepository & {
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
  }) => Promise<N8nUser | null>;
  findOneBy: (where: { email: string }) => Promise<N8nUserRecord | null>;
};

export type BaseN8nProjectRepository = BaseN8nRepository & {
  findOneBy: (where: { id: string }) => Promise<N8nProjectRecord | null>;
  getPersonalProjectForUser: (userId: string) => Promise<N8nProjectRecord | null>;
  getPersonalProjectForUserOrFail: (userId: string) => Promise<N8nProjectRecord>;
};

export type BaseN8nProjectRelationRepository = BaseN8nRepository & {
  findProjectRole: (args: { userId: string; projectId: string }) => Promise<unknown>;
  findAllByUser: (userId: string) => Promise<Array<{ projectId: string }>>;
};

export type BaseN8nWorkflowRepository = BaseN8nRepository & {
  findOneBy: (where: { id: string }) => Promise<N8nEntityRecord | null>;
};

export type BaseN8nCredentialRepository = BaseN8nRepository & {
  findOneBy: (where: { id: string }) => Promise<N8nEntityRecord | null>;
};

export type BaseN8nRepositoryEntityManager = {
  delete: (entityName: string, criteria: unknown) => Promise<unknown>;
  create: (entityName: string, payload: Record<string, unknown>) => Record<string, unknown>;
  save: (value: unknown) => Promise<unknown>;
};

export type N8nWithTransaction = (
  manager: Record<string, unknown>,
  context: unknown,
  handler: (entityManager: BaseN8nRepositoryEntityManager) => Promise<void>,
) => Promise<void>;

export type BaseN8nSharedWorkflowRepository = BaseN8nRepository & {
  findProjectIds: (workflowId: string) => Promise<string[]>;
  create: (value: Record<string, unknown>) => Record<string, unknown>;
  save: (value: Record<string, unknown>) => Promise<unknown>;
  delete: (criteria: Record<string, unknown>) => Promise<unknown>;
};

export type BaseN8nExecutionRepository = BaseN8nRepository & {
  findSingleExecution: (
    id: string,
    options?: { includeData?: boolean; unflattenData?: boolean },
  ) => Promise<{ workflowId: string } | null | undefined>;
};

export type BaseN8nSharedCredentialRepository = BaseN8nRepository;

export type BaseN8nRepositories = {
  user: BaseN8nUserRepository;
  project: BaseN8nProjectRepository;
  projectRelation: BaseN8nProjectRelationRepository;
  workflow: BaseN8nWorkflowRepository;
  credential: BaseN8nCredentialRepository;
  sharedWorkflow: BaseN8nSharedWorkflowRepository;
  sharedCredential: BaseN8nSharedCredentialRepository;
  execution: BaseN8nExecutionRepository;
  withTransaction: N8nWithTransaction;
};
