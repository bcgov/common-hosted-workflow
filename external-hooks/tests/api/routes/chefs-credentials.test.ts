/**
 * CHEFS credential routes act as the signed-in n8n user so n8n's permission
 * model decides access; a session without an n8n user is refused.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveWilTenantProjectIdsMock } = vi.hoisted(() => ({ resolveWilTenantProjectIdsMock: vi.fn() }));

vi.mock('../../../src/api/routes/helpers/wil-tenant', () => ({
  resolveWilTenantProjectIds: resolveWilTenantProjectIdsMock,
  extractTenantId: vi.fn(),
}));

import { buildTriggerRouter } from '../../../src/api/routes/triggers';
import { createMockRequest, createMockResponse } from '../../helpers/mocks';
import { getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';

const USER = { id: 'user-1', role: { slug: 'global:member' } };
const SESSION = { email: 'u@example.com', tenantRoles: [], n8nUser: { id: 'user-1' } };

function createRouter() {
  const chefs = {
    listFormCredentials: vi.fn().mockResolvedValue({ credentials: [], canCreate: true }),
    createFormCredential: vi.fn().mockResolvedValue({
      id: 'cred-new',
      name: 'Intake credential',
      formName: 'Intake',
      formId: 'form-123',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      scopes: ['credential:read'],
    }),
    updateFormCredential: vi.fn(),
  };
  const findByIdWithRole = vi.fn().mockResolvedValue(USER);
  const router = buildTriggerRouter({
    services: { chefs },
    customRepositories: { tenantProjectRelation: {} },
    n8nRepositories: { user: { findByIdWithRole } },
  } as any);
  return { router, chefs, findByIdWithRole };
}

beforeEach(() => {
  resolveWilTenantProjectIdsMock.mockReset();
  resolveWilTenantProjectIdsMock.mockResolvedValue({ tenantId: 't-1', projectIds: ['proj-1', 'proj-2'] });
});

describe('GET /chefs-credentials', () => {
  it('lists as the n8n user within the tenant projects', async () => {
    const { router, chefs, findByIdWithRole } = createRouter();
    const req = createMockRequest({ session: SESSION } as any);
    const res = createMockResponse();

    const error = await runHandlerChain(getRouteHandlers(router, 'get', '/chefs-credentials')!, req, res);

    expect(error).toBeNull();
    expect(findByIdWithRole).toHaveBeenCalledWith('user-1');
    expect(chefs.listFormCredentials).toHaveBeenCalledWith(USER, ['proj-1', 'proj-2']);
    expect(res.json.mock.calls[0][0]).toEqual({ data: [], canCreate: true });
  });

  it('returns 403 when the session has no n8n user', async () => {
    const { router, chefs } = createRouter();
    const req = createMockRequest({ session: { ...SESSION, n8nUser: null } } as any);
    const res = createMockResponse();

    await runHandlerChain(getRouteHandlers(router, 'get', '/chefs-credentials')!, req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(chefs.listFormCredentials).not.toHaveBeenCalled();
  });
});

describe('POST /chefs-credentials', () => {
  it('creates owned by the first tenant project only', async () => {
    const { router, chefs } = createRouter();
    const body = {
      name: 'Intake credential',
      formName: 'Intake',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      formId: 'form-123',
      apiKey: 'secret', // pragma: allowlist secret
    };
    const req = createMockRequest({ session: SESSION, body } as any);
    const res = createMockResponse();

    const error = await runHandlerChain(getRouteHandlers(router, 'post', '/chefs-credentials')!, req, res);

    expect(error).toBeNull();
    expect(chefs.createFormCredential).toHaveBeenCalledWith(USER, { ...body, projectId: 'proj-1' });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret');
  });
});
