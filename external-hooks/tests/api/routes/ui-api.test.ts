import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUiSessionMock } = vi.hoisted(() => ({
  getUiSessionMock: vi.fn(),
}));

vi.mock('../../../src/api/helpers/ui-oidc-session', async () => {
  const actual = await vi.importActual<typeof import('../../../src/api/helpers/ui-oidc-session')>(
    '../../../src/api/helpers/ui-oidc-session',
  );

  return {
    ...actual,
    getUiSession: getUiSessionMock,
  };
});

import { buildUiApiRouter } from '../../../src/api/routes/ui-api';
import { createMockRequest, createMockResponse } from '../../helpers/mocks';
import { getRouteHandlers } from '../../helpers/test-utils';

async function runRoute(router: any, method: string, path: string, req: any, res: any) {
  const handlers = getRouteHandlers(router, method, path) ?? [];
  let index = 0;

  const next = async (error?: unknown) => {
    if (error) {
      throw error;
    }

    const handler = handlers[index++];
    if (handler) {
      await handler(req, res, next);
    }
  };

  await next();
}

async function runProtectedRoute(services: any, method: string, path: string, req: any, res: any) {
  const router = buildUiApiRouter({ services } as any);
  await runRoute(router, method, path, req, res);
}

beforeEach(() => {
  getUiSessionMock.mockReset();
  getUiSessionMock.mockResolvedValue({
    subject: 'sub-1',
    email: 'person@example.com',
    issuer: 'https://issuer.example.com',
    audience: ['app'],
    claims: {},
    n8nUser: {
      id: 'user-123',
      email: 'person@example.com',
      role: null,
    },
  });
});

describe('GET /ui-api/whoami', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      loadUserContext: vi.fn().mockResolvedValue({
        n8nUser: {
          id: 'user-123',
          email: 'person@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        accessibleProjectIds: ['proj-1'],
        projects: [],
        workflows: [],
      }),
    };
    const req = createMockRequest({ get: vi.fn(() => undefined) as any });
    const res = createMockResponse();

    await runProtectedRoute({ uiApi }, 'get', '/whoami', req as any, res as any);

    expect(getUiSessionMock).toHaveBeenCalledWith(req);
    expect(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        n8nUser: {
          id: 'user-123',
          email: 'person@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: false,
          canReviewAccessRequests: false,
        },
      }),
    );
  });
});

describe('GET /ui-api/workflows', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      loadUserContext: vi.fn().mockResolvedValue({
        n8nUser: {
          id: 'user-123',
          email: 'person@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        accessibleProjectIds: ['proj-1'],
        projects: [
          {
            id: 'proj-1',
            name: 'Project One',
            type: 'personal',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            icon: null,
            description: null,
            creatorId: 'user-123',
          },
        ],
        workflows: [
          {
            workflowId: 'wf-1',
            workflowName: 'First workflow',
            projectIds: ['proj-1'],
            userEmails: ['person@example.com'],
          },
        ],
      }),
    };
    const req = createMockRequest({ get: vi.fn(() => undefined) as any });
    const res = createMockResponse();

    await runProtectedRoute({ uiApi }, 'get', '/workflows', req as any, res as any);

    expect(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
    expect(res.json).toHaveBeenCalledWith([
      {
        workflowId: 'wf-1',
        workflowName: 'First workflow',
        projectIds: ['proj-1'],
        userEmails: ['person@example.com'],
      },
    ]);
  });
});

describe('POST /ui-api/workflows/:workflowId/share', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      loadUserContext: vi.fn().mockResolvedValue({
        n8nUser: {
          id: 'user-123',
          email: 'person@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        accessibleProjectIds: ['proj-1'],
        projects: [],
        workflows: [],
      }),
      shareWorkflow: vi.fn().mockResolvedValue({
        workflowId: 'wf-1',
        sharedWithEmail: 'new@example.com',
      }),
    };
    const req = createMockRequest({
      params: { workflowId: 'wf-1' },
      body: { email: 'new@example.com' },
      get: vi.fn(() => undefined) as any,
    });
    const res = createMockResponse();

    await runProtectedRoute({ uiApi }, 'post', '/workflows/:workflowId/share', req as any, res as any);

    expect(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
    expect(uiApi.shareWorkflow).toHaveBeenCalledWith('person@example.com', 'wf-1', 'new@example.com');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-1',
        sharedWithEmail: 'new@example.com',
      }),
    );
  });
});

describe('DELETE /ui-api/workflows/:workflowId/projects/:projectId', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      loadUserContext: vi.fn().mockResolvedValue({
        n8nUser: {
          id: 'user-123',
          email: 'person@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        accessibleProjectIds: ['proj-1'],
        projects: [],
        workflows: [],
      }),
      unshareWorkflow: vi.fn().mockResolvedValue({
        workflowId: 'wf-1',
        projectId: 'proj-1',
      }),
    };
    const req = createMockRequest({
      params: { workflowId: 'wf-1', projectId: 'proj-1' },
      get: vi.fn(() => undefined) as any,
    });
    const res = createMockResponse();

    await runProtectedRoute({ uiApi }, 'delete', '/workflows/:workflowId/projects/:projectId', req as any, res as any);

    expect(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
    expect(uiApi.unshareWorkflow).toHaveBeenCalledWith('person@example.com', 'wf-1', 'proj-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-1',
        projectId: 'proj-1',
      }),
    );
  });
});

describe('GET /ui-api/access-requests/my', () => {
  it('returns the wrapped access request response shape', async () => {
    const accessRequest = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      requesterEmail: 'person@example.com',
      justification: 'Need access to manage workflows.',
      status: 'pending',
      reviewerEmail: null,
      reviewerN8nUserId: null,
      denyReason: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    const uiApi = {
      loadUserContext: vi.fn().mockResolvedValue({
        n8nUser: {
          id: 'user-123',
          email: 'person@example.com',
          disabled: false,
          role: null,
        },
        accessibleProjectIds: [],
        projects: [],
        workflows: [],
      }),
    };
    const accessRequestService = {
      getMyAccessRequest: vi.fn().mockResolvedValue(accessRequest),
    };
    const req = createMockRequest({ get: vi.fn(() => undefined) as any });
    const res = createMockResponse();

    await runProtectedRoute(
      { uiApi, accessRequest: accessRequestService },
      'get',
      '/access-requests/my',
      req as any,
      res as any,
    );

    expect(accessRequestService.getMyAccessRequest).toHaveBeenCalledWith('person@example.com');
    expect(res.json).toHaveBeenCalledWith({ accessRequest });
  });
});
