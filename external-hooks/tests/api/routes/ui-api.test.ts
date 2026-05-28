import { describe, expect, it, vi } from 'vitest';
import { buildUiApiRouter } from '../../../src/api/routes/ui-api';
import { createMockRequest, createMockResponse } from '../../helpers/mocks';

function getRouteHandler(router: any, method: string, path: string) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }
  }
  return null;
}

describe('GET /ui-api/whoami', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      getWhoami: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'person@example.com',
        role: { slug: 'global:admin', displayName: 'Admin' },
      }),
    };
    const router = buildUiApiRouter({ services: { uiApi } } as any);
    const handler = getRouteHandler(router, 'get', '/whoami');
    const req = createMockRequest({ get: vi.fn(() => undefined) as any });
    const res = createMockResponse({
      oidcTokenDetails: {
        email: 'person@example.com',
        issuer: 'https://issuer.example.com',
        subject: 'sub-1',
        audience: ['app'],
        claims: {},
      },
    });

    await handler(req as any, res as any, vi.fn());

    expect(uiApi.getWhoami).toHaveBeenCalledWith('person@example.com');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        n8nUser: {
          id: 'user-123',
          email: 'person@example.com',
          role: { slug: 'global:admin', displayName: 'Admin' },
        },
      }),
    );
  });
});

describe('GET /ui-api/workflows', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      getWorkflows: vi.fn().mockResolvedValue({
        n8nUser: {
          id: 'user-123',
          email: 'person@example.com',
          role: { slug: 'global:member', displayName: 'Member' },
        },
        accessibleProjectIds: ['proj-1'],
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
    const router = buildUiApiRouter({ services: { uiApi } } as any);
    const handler = getRouteHandler(router, 'get', '/workflows');
    const req = createMockRequest({ get: vi.fn(() => undefined) as any });
    const res = createMockResponse({
      oidcTokenDetails: {
        email: 'person@example.com',
        issuer: 'https://issuer.example.com',
        subject: 'sub-1',
        audience: ['app'],
        claims: {},
      },
    });

    await handler(req as any, res as any, vi.fn());

    expect(uiApi.getWorkflows).toHaveBeenCalledWith('person@example.com');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        workflows: [
          {
            workflowId: 'wf-1',
            workflowName: 'First workflow',
            projectIds: ['proj-1'],
            userEmails: ['person@example.com'],
          },
        ],
      }),
    );
  });
});

describe('POST /ui-api/workflows/:workflowId/share', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      shareWorkflow: vi.fn().mockResolvedValue({
        workflowId: 'wf-1',
        sharedWithEmail: 'new@example.com',
      }),
    };
    const router = buildUiApiRouter({ services: { uiApi } } as any);
    const handler = getRouteHandler(router, 'post', '/workflows/:workflowId/share');
    const req = createMockRequest({
      params: { workflowId: 'wf-1' },
      body: { email: 'new@example.com' },
      get: vi.fn(() => undefined) as any,
    });
    const res = createMockResponse({
      oidcTokenDetails: {
        email: 'person@example.com',
        issuer: 'https://issuer.example.com',
        subject: 'sub-1',
        audience: ['app'],
        claims: {},
      },
    });

    await handler(req as any, res as any, vi.fn());

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
      unshareWorkflow: vi.fn().mockResolvedValue({
        workflowId: 'wf-1',
        projectId: 'proj-1',
      }),
    };
    const router = buildUiApiRouter({ services: { uiApi } } as any);
    const handler = getRouteHandler(router, 'delete', '/workflows/:workflowId/projects/:projectId');
    const req = createMockRequest({
      params: { workflowId: 'wf-1', projectId: 'proj-1' },
      get: vi.fn(() => undefined) as any,
    });
    const res = createMockResponse({
      oidcTokenDetails: {
        email: 'person@example.com',
        issuer: 'https://issuer.example.com',
        subject: 'sub-1',
        audience: ['app'],
        claims: {},
      },
    });

    await handler(req as any, res as any, vi.fn());

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
