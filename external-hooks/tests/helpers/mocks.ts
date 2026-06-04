/**
 * Shared mock factories and fixtures for external-hooks unit tests.
 *
 * Provides lightweight Express req/res/next fakes, repository stubs,
 * and domain object builders so individual test files stay focused on
 * behaviour rather than boilerplate.
 */
import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const VALID_TENANT_ID = 'a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d';
export const VALID_PROJECT_ID = 'proj-001';
export const VALID_WORKFLOW_ID = 'wf-100';
export const VALID_EXECUTION_ID = 'exec-200';
export const VALID_ACTOR_ID = 'actor-42';
export const VALID_ACTION_ID = 'act-99';
export const VALID_API_KEY = 'test-api-key-value'; // pragma: allowlist secret
export const VALID_INTERNAL_TOKEN = 'internal-bearer-token'; // pragma: allowlist secret

/* ------------------------------------------------------------------ */
/*  Express fakes                                                      */
/* ------------------------------------------------------------------ */

export interface MockResponse extends Partial<Response> {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  locals: Record<string, unknown>;
  header: ReturnType<typeof vi.fn>;
}

export function createMockRequest(overrides: Partial<Request> = {}): Request {
  const req: Partial<Request> = {
    body: {},
    query: {},
    params: {},
    headers: {},
    header: vi.fn((name: string) => {
      const lower = name.toLowerCase();
      const headers = (req as Record<string, unknown>).headers as Record<string, string>;
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === lower) return v;
      }
      return undefined;
    }) as unknown as Request['header'],
    ...overrides,
  };
  return req as Request;
}

export function createMockResponse(localsOverrides: Record<string, unknown> = {}): MockResponse {
  const res: MockResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: { ...localsOverrides },
    header: vi.fn(),
  };
  return res;
}

export function createMockNext(): NextFunction & ReturnType<typeof vi.fn> {
  return vi.fn() as NextFunction & ReturnType<typeof vi.fn>;
}

/* ------------------------------------------------------------------ */
/*  Caller / User fixtures                                             */
/* ------------------------------------------------------------------ */

export function makeCaller(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    disabled: false,
    role: { slug: 'global:member', displayName: 'Member' },
    ...overrides,
  };
}

export function makeAdminCaller(roleSlug = 'global:owner') {
  return makeCaller({ role: { slug: roleSlug, displayName: 'Owner' } });
}

/* ------------------------------------------------------------------ */
/*  Domain object builders                                             */
/* ------------------------------------------------------------------ */

const BASE_DATE = new Date('2025-06-01T12:00:00.000Z');

export function makeMessageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-001',
    title: 'Test message',
    body: 'Hello world',
    actorId: VALID_ACTOR_ID,
    actorType: 'user',
    workflowInstanceId: VALID_EXECUTION_ID,
    workflowId: VALID_WORKFLOW_ID,
    projectId: VALID_PROJECT_ID,
    status: 'active',
    metadata: null,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    ...overrides,
  };
}

export function makeActionRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_ACTION_ID,
    actionType: 'approval',
    payload: { key: 'value' },
    callbackUrl: 'https://example.com/callback',
    callbackMethod: 'POST',
    callbackPayloadSpec: null,
    actorId: VALID_ACTOR_ID,
    actorType: 'user',
    workflowInstanceId: VALID_EXECUTION_ID,
    workflowId: VALID_WORKFLOW_ID,
    projectId: VALID_PROJECT_ID,
    status: 'pending',
    priority: 'normal',
    dueDate: null,
    checkIn: null,
    metadata: null,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Repository mocks                                                   */
/* ------------------------------------------------------------------ */

export function createMockMessageRepository() {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(makeMessageRow()),
  };
}

export function createMockActionRequestRepository() {
  return {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(makeActionRequestRow()),
    updateStatus: vi.fn().mockResolvedValue(makeActionRequestRow()),
  };
}

export function createMockTenantProjectRelationRepository() {
  return {
    getProjectIdsByTenantId: vi.fn().mockResolvedValue([VALID_PROJECT_ID]),
    getTenantIdByProjectId: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue(undefined),
  };
}

/* ------------------------------------------------------------------ */
/*  n8n repository mocks                                               */
/* ------------------------------------------------------------------ */

export function createMockN8nRepositories() {
  const defaultProject = {
    id: VALID_PROJECT_ID,
    name: 'Default project',
    type: 'personal',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    icon: null,
    description: null,
    creatorId: 'user-123',
  };
  const metadata = {
    SharedWorkflow: {
      tableName: 'shared_workflow',
      columns: [
        { propertyName: 'workflowId', databaseName: 'workflow_id' },
        { propertyName: 'projectId', databaseName: 'project_id' },
      ],
    },
    Workflow: {
      tableName: 'workflow_entity',
      columns: [
        { propertyName: 'id', databaseName: 'id' },
        { propertyName: 'name', databaseName: 'name' },
      ],
    },
    ProjectRelation: {
      tableName: 'project_relation',
      columns: [
        { propertyName: 'projectId', databaseName: 'project_id' },
        { propertyName: 'userId', databaseName: 'user_id' },
      ],
    },
    User: {
      tableName: 'user',
      columns: [
        { propertyName: 'id', databaseName: 'id' },
        { propertyName: 'email', databaseName: 'email' },
      ],
    },
  } as const;

  const makeManager = () => ({
    query: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (callback: (em: any) => Promise<unknown>) => {
      const em = {
        create: vi.fn((_entityName, payload) => payload),
        save: vi.fn(async (value) => value),
      };
      return await callback(em);
    }),
    connection: {
      getMetadata: vi.fn((entityName: keyof typeof metadata) => metadata[entityName]),
    },
  });

  return {
    user: { findOne: vi.fn(), findOneBy: vi.fn(), metadata: metadata.User },
    project: {
      findOneBy: vi.fn().mockImplementation(async ({ id }) => (id === VALID_PROJECT_ID ? defaultProject : null)),
      getPersonalProjectForUser: vi.fn().mockResolvedValue(defaultProject),
      getPersonalProjectForUserOrFail: vi.fn().mockResolvedValue(defaultProject),
    },
    projectRelation: {
      findProjectRole: vi.fn().mockResolvedValue(null),
      findAllByUser: vi.fn().mockResolvedValue([{ projectId: VALID_PROJECT_ID }]),
      metadata: metadata.ProjectRelation,
      manager: makeManager(),
    },
    workflow: { findOneBy: vi.fn(), metadata: metadata.Workflow },
    credential: { findOneBy: vi.fn() },
    sharedWorkflow: {
      findProjectIds: vi.fn().mockResolvedValue([VALID_PROJECT_ID]),
      findRowsByWorkflowId: vi
        .fn()
        .mockResolvedValue([
          { workflowId: VALID_WORKFLOW_ID, workflowName: 'Test workflow', projectId: VALID_PROJECT_ID },
        ]),
      create: vi.fn((_value) => _value),
      save: vi.fn(async (value) => value),
      delete: vi.fn(async () => undefined),
      metadata: metadata.SharedWorkflow,
      manager: makeManager(),
    },
    sharedCredential: { manager: {} },
    withTransaction: vi.fn(),
    execution: {
      findSingleExecution: vi.fn().mockResolvedValue({ workflowId: VALID_WORKFLOW_ID }),
    },
  };
}

export function createMockUserRepository() {
  return {
    getUserForApiKey: vi.fn().mockResolvedValue(makeCaller()),
  } as any;
}

/* ------------------------------------------------------------------ */
/*  Repository object mocks                                            */
/* ------------------------------------------------------------------ */

import { UserRepository } from '../../src/db/repository/n8n/user';
import { ProjectRepository } from '../../src/db/repository/n8n/project';
import { ProjectRelationRepository } from '../../src/db/repository/n8n/project-relation';
import { SharedWorkflowRepository } from '../../src/db/repository/n8n/shared-workflow';
import { WorkflowRepository } from '../../src/db/repository/n8n/workflow';
import { CredentialRepository } from '../../src/db/repository/n8n/credential';
import { SharedCredentialRepository } from '../../src/db/repository/n8n/shared-credential';
import { ExecutionRepository } from '../../src/db/repository/n8n/execution';
import type { N8nRepositories } from '../../src/api/bootstrap/n8n-repositories';

export function createMockN8nRepositoryObject(n8nRepos: ReturnType<typeof createMockN8nRepositories>): N8nRepositories {
  return {
    user: new UserRepository(n8nRepos.user as any),
    project: new ProjectRepository(n8nRepos.project as any),
    projectRelation: new ProjectRelationRepository(n8nRepos.projectRelation as any, n8nRepos.user.metadata),
    workflow: new WorkflowRepository(n8nRepos.workflow as any),
    sharedWorkflow: new SharedWorkflowRepository(n8nRepos.sharedWorkflow as any, n8nRepos.workflow.metadata),
    credential: new CredentialRepository(n8nRepos.credential as any),
    sharedCredential: new SharedCredentialRepository(n8nRepos.sharedCredential as any),
    execution: new ExecutionRepository(n8nRepos.execution as any),
    withTransaction: n8nRepos.withTransaction as any,
    raw: n8nRepos as any,
  };
}

/* ------------------------------------------------------------------ */
/*  Service mocks (using real service classes with mocked repos)       */
/* ------------------------------------------------------------------ */

import { ActionService } from '../../src/api/services/action.service';
import { MessageService } from '../../src/api/services/message.service';

export function createMockActionService(
  actionRequestRepo: ReturnType<typeof createMockActionRequestRepository>,
  n8nRepos: ReturnType<typeof createMockN8nRepositories>,
) {
  return new ActionService({
    actionRequestRepository: actionRequestRepo as any,
    executionRepository: n8nRepos.execution,
    sharedWorkflowRepository: n8nRepos.sharedWorkflow as any,
  });
}

export function createMockMessageService(
  messageRepo: ReturnType<typeof createMockMessageRepository>,
  n8nRepos: ReturnType<typeof createMockN8nRepositories>,
) {
  return new MessageService({
    messageRepository: messageRepo as any,
    executionRepository: n8nRepos.execution,
    sharedWorkflowRepository: n8nRepos.sharedWorkflow as any,
  });
}
