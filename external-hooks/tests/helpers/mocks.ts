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
    updateStatus: vi.fn().mockResolvedValue(true),
  };
}

export function createMockTenantProjectRelationRepository() {
  return {
    getProjectIdsByTenantId: vi.fn().mockResolvedValue([VALID_PROJECT_ID]),
    hasProjectId: vi.fn().mockResolvedValue(true),
    insertTenantProjectRelation: vi.fn().mockResolvedValue({ created: true }),
  };
}

/* ------------------------------------------------------------------ */
/*  n8n repository mocks                                               */
/* ------------------------------------------------------------------ */

export function createMockN8nRepositories() {
  return {
    user: { findOneBy: vi.fn() },
    project: {
      findOneBy: vi.fn(),
      getPersonalProjectForUser: vi.fn().mockResolvedValue({ id: VALID_PROJECT_ID }),
      getPersonalProjectForUserOrFail: vi.fn().mockResolvedValue({ id: VALID_PROJECT_ID }),
    },
    projectRelation: {
      findProjectRole: vi.fn().mockResolvedValue(null),
      findAllByUser: vi.fn().mockResolvedValue([{ projectId: VALID_PROJECT_ID }]),
    },
    workflow: { findOneBy: vi.fn() },
    credential: { findOneBy: vi.fn() },
    sharedWorkflow: {
      findProjectIds: vi.fn().mockResolvedValue([VALID_PROJECT_ID]),
      manager: {},
    },
    sharedCredential: { manager: {} },
    withTransaction: vi.fn(),
    execution: {
      findSingleExecution: vi.fn().mockResolvedValue({ workflowId: VALID_WORKFLOW_ID }),
    },
  };
}

export function createMockApiKeyService() {
  return {
    getUserForApiKey: vi.fn().mockResolvedValue(makeCaller()),
  };
}
