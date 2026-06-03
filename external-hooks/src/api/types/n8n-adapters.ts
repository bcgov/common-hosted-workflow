import type { EntityMetadataLike } from '../../db/repository/n8n/sql';
import type { N8nUiUser } from '../../db/repository/n8n/user';
import type { N8nExecutionLookup } from '../helpers/n8n-validation';
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

export type N8nApiKeyUserLookup = {
  findOne: (options: {
    where: {
      apiKeys: {
        apiKey: string;
        audience: string;
      };
    };
    relations: string[];
  }) => Promise<User | null>;
};

export type N8nUiUserLookup = {
  metadata: EntityMetadataLike;
  findOne: (options: { where: { email: string }; relations: string[] }) => Promise<N8nUiUser | null>;
};

export type N8nAdminUserLookup = {
  findOneBy: (where: { email: string }) => Promise<N8nUserRecord | null>;
};

export type N8nUserRepository = N8nApiKeyUserLookup & N8nUiUserLookup & N8nAdminUserLookup;

export type N8nProjectRepository = {
  findOneBy: (where: { id: string }) => Promise<N8nProjectRecord | null>;
  getPersonalProjectForUser: (userId: string) => Promise<N8nProjectRecord | null>;
  getPersonalProjectForUserOrFail: (userId: string) => Promise<N8nProjectRecord>;
};

export type N8nProjectRelationRepository = {
  metadata: EntityMetadataLike;
  manager: {
    query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  };
  findProjectRole: (args: { userId: string; projectId: string }) => Promise<unknown>;
  findAllByUser: (userId: string) => Promise<Array<{ projectId: string }>>;
};

export type N8nWorkflowRepository = {
  metadata: EntityMetadataLike;
  findOneBy: (where: { id: string }) => Promise<N8nEntityRecord | null>;
};

export type N8nCredentialRepository = {
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

export type N8nSharedWorkflowRepository = {
  metadata: EntityMetadataLike;
  manager: {
    query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  } & Record<string, unknown>;
  findProjectIds: (workflowId: string) => Promise<string[]>;
  create: (value: Record<string, unknown>) => Record<string, unknown>;
  save: (value: Record<string, unknown>) => Promise<unknown>;
  delete: (criteria: Record<string, unknown>) => Promise<unknown>;
};

export type N8nSharedCredentialRepository = {
  manager: Record<string, unknown>;
};

export type N8nRepositories = {
  user: N8nUserRepository;
  project: N8nProjectRepository;
  projectRelation: N8nProjectRelationRepository;
  workflow: N8nWorkflowRepository;
  credential: N8nCredentialRepository;
  sharedWorkflow: N8nSharedWorkflowRepository;
  sharedCredential: N8nSharedCredentialRepository;
  withTransaction: N8nWithTransaction;
  execution: N8nExecutionLookup;
};
