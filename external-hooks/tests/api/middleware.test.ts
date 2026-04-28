import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createAuthMiddleware, createWorkflowInteractionTenantMiddleware } from '../../src/api/middleware';
import { AppError } from '../../src/api/utils/errors';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createMockApiKeyService,
  makeCaller,
  makeAdminCaller,
  VALID_TENANT_ID,
  VALID_PROJECT_ID,
  VALID_API_KEY,
  VALID_INTERNAL_TOKEN,
} from '../helpers/mocks';

const GLOBAL_OWNER_SLUG = 'global:owner';
const GLOBAL_ADMIN_SLUG = 'global:admin';

/* ================================================================== */
/*  apiKeyAuthMiddleware                                               */
/* ================================================================== */

describe('apiKeyAuthMiddleware', () => {
  it('sets res.locals.caller and calls next on valid API key', async () => {
    const apiKeyService = createMockApiKeyService();
    const { apiKeyAuthMiddleware } = createAuthMiddleware({
      apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });

    const req = createMockRequest({ headers: { 'X-N8N-API-KEY': VALID_API_KEY } });
    const res = createMockResponse();
    const next = createMockNext();

    await apiKeyAuthMiddleware(req, res as any, next);

    expect(res.locals.caller).toBeDefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 401 when no API key header', async () => {
    const apiKeyService = createMockApiKeyService();
    const { apiKeyAuthMiddleware } = createAuthMiddleware({
      apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });

    const req = createMockRequest({ headers: {} });
    const res = createMockResponse();
    const next = createMockNext();

    await apiKeyAuthMiddleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('returns 401 when getUserForApiKey returns null', async () => {
    const apiKeyService = createMockApiKeyService();
    apiKeyService.getUserForApiKey.mockResolvedValue(null);
    const { apiKeyAuthMiddleware } = createAuthMiddleware({
      apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });

    const req = createMockRequest({ headers: { 'X-N8N-API-KEY': 'bad-key' } });
    const res = createMockResponse();
    const next = createMockNext();

    await apiKeyAuthMiddleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('returns 401 when user is disabled', async () => {
    const apiKeyService = createMockApiKeyService();
    apiKeyService.getUserForApiKey.mockResolvedValue(makeCaller({ disabled: true }));
    const { apiKeyAuthMiddleware } = createAuthMiddleware({
      apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });

    const req = createMockRequest({ headers: { 'X-N8N-API-KEY': VALID_API_KEY } });
    const res = createMockResponse();
    const next = createMockNext();

    await apiKeyAuthMiddleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  it('returns 401 when getUserForApiKey throws', async () => {
    const apiKeyService = createMockApiKeyService();
    apiKeyService.getUserForApiKey.mockRejectedValue(new Error('DB down'));
    const { apiKeyAuthMiddleware } = createAuthMiddleware({
      apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });

    const req = createMockRequest({ headers: { 'X-N8N-API-KEY': VALID_API_KEY } });
    const res = createMockResponse();
    const next = createMockNext();

    await apiKeyAuthMiddleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });
});

/* ================================================================== */
/*  adminAuthMiddleware                                                */
/* ================================================================== */

describe('adminAuthMiddleware', () => {
  it('calls next for global owner role', async () => {
    const apiKeyService = createMockApiKeyService();
    apiKeyService.getUserForApiKey.mockResolvedValue(makeAdminCaller(GLOBAL_OWNER_SLUG));
    const { adminAuthMiddleware } = createAuthMiddleware({
      apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });

    const req = createMockRequest({ headers: { 'X-N8N-API-KEY': VALID_API_KEY } });
    const res = createMockResponse();
    const next = createMockNext();

    await adminAuthMiddleware(req, res as any, next);

    // next should be called without an error argument
    const lastCall = next.mock.calls[next.mock.calls.length - 1];
    expect(lastCall[0]).toBeUndefined();
  });

  it('calls next for global admin role', async () => {
    const apiKeyService = createMockApiKeyService();
    apiKeyService.getUserForApiKey.mockResolvedValue(makeAdminCaller(GLOBAL_ADMIN_SLUG));
    const { adminAuthMiddleware } = createAuthMiddleware({
      apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });

    const req = createMockRequest({ headers: { 'X-N8N-API-KEY': VALID_API_KEY } });
    const res = createMockResponse();
    const next = createMockNext();

    await adminAuthMiddleware(req, res as any, next);

    const lastCall = next.mock.calls[next.mock.calls.length - 1];
    expect(lastCall[0]).toBeUndefined();
  });

  it('returns 403 for non-admin role', async () => {
    const apiKeyService = createMockApiKeyService();
    apiKeyService.getUserForApiKey.mockResolvedValue(makeCaller({ role: { slug: 'global:member' } }));
    const { adminAuthMiddleware } = createAuthMiddleware({
      apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });

    const req = createMockRequest({ headers: { 'X-N8N-API-KEY': VALID_API_KEY } });
    const res = createMockResponse();
    const next = createMockNext();

    await adminAuthMiddleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[next.mock.calls.length - 1][0] as AppError;
    expect(error.statusCode).toBe(403);
  });
});

/* ================================================================== */
/*  createWorkflowInteractionTenantMiddleware                          */
/* ================================================================== */

describe('createWorkflowInteractionTenantMiddleware', () => {
  function createMiddleware(overrides: Record<string, unknown> = {}) {
    const projectRepo = {
      getPersonalProjectForUser: vi.fn().mockResolvedValue({ id: VALID_PROJECT_ID }),
      ...((overrides.projectRepo as Record<string, unknown>) ?? {}),
    };
    const projectRelationRepo = {
      findAllByUser: vi.fn().mockResolvedValue([{ projectId: VALID_PROJECT_ID }]),
      ...((overrides.projectRelationRepo as Record<string, unknown>) ?? {}),
    };
    const tenantProjectRelationRepo = {
      getProjectIdsByTenantId: vi.fn().mockResolvedValue([VALID_PROJECT_ID]),
      ...((overrides.tenantProjectRelationRepo as Record<string, unknown>) ?? {}),
    };

    return createWorkflowInteractionTenantMiddleware({
      n8nRepositories: { project: projectRepo, projectRelation: projectRelationRepo },
      customRepositories: { tenantProjectRelation: tenantProjectRelationRepo },
    });
  }

  it('sets chwfAllowedProjectIds on valid tenant + user scope', async () => {
    const middleware = createMiddleware();
    const req = createMockRequest({
      headers: { 'X-TENANT-ID': VALID_TENANT_ID },
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = createMockResponse({ caller: makeCaller() });
    const next = createMockNext();

    await middleware(req, res as any, next);

    expect(res.locals.chwfAllowedProjectIds).toEqual([VALID_PROJECT_ID]);
    expect(res.locals.chwfTenantId).toBe(VALID_TENANT_ID);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 400 when X-TENANT-ID header is missing', async () => {
    const middleware = createMiddleware();
    const req = createMockRequest({ headers: {}, method: 'GET', originalUrl: '/rest/custom/v1/messages/' });
    const res = createMockResponse({ caller: makeCaller() });
    const next = createMockNext();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(400);
  });

  it('returns 400 when tenant ID is not a valid UUID', async () => {
    const middleware = createMiddleware();
    const req = createMockRequest({
      headers: { 'X-TENANT-ID': 'not-a-uuid' },
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = createMockResponse({ caller: makeCaller() });
    const next = createMockNext();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(400);
  });

  it('returns 403 when tenant has no projects', async () => {
    const middleware = createMiddleware({
      tenantProjectRelationRepo: {
        getProjectIdsByTenantId: vi.fn().mockResolvedValue([]),
      },
    });
    const req = createMockRequest({
      headers: { 'X-TENANT-ID': VALID_TENANT_ID },
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = createMockResponse({ caller: makeCaller() });
    const next = createMockNext();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('returns 403 when intersection of tenant and user projects is empty', async () => {
    const middleware = createMiddleware({
      projectRepo: {
        getPersonalProjectForUser: vi.fn().mockResolvedValue({ id: 'other-proj' }),
      },
      projectRelationRepo: {
        findAllByUser: vi.fn().mockResolvedValue([{ projectId: 'other-proj' }]),
      },
    });
    const req = createMockRequest({
      headers: { 'X-TENANT-ID': VALID_TENANT_ID },
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = createMockResponse({ caller: makeCaller() });
    const next = createMockNext();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('returns 401 when caller.id is missing', async () => {
    const middleware = createMiddleware();
    const req = createMockRequest({
      headers: { 'X-TENANT-ID': VALID_TENANT_ID },
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = createMockResponse({ caller: undefined });
    const next = createMockNext();

    await middleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
  });

  describe('internal POST bearer validation', () => {
    const originalEnv = process.env.INTERNAL_AUTH_TOKEN;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.INTERNAL_AUTH_TOKEN;
      } else {
        process.env.INTERNAL_AUTH_TOKEN = originalEnv;
      }
    });

    it('returns 500 when INTERNAL_AUTH_TOKEN not configured for internal POST', async () => {
      delete process.env.INTERNAL_AUTH_TOKEN;
      const middleware = createMiddleware();
      const req = createMockRequest({
        headers: { 'X-TENANT-ID': VALID_TENANT_ID, Authorization: `Bearer ${VALID_INTERNAL_TOKEN}` },
        method: 'POST',
        originalUrl: '/rest/custom/v1/messages/',
      });
      const res = createMockResponse({ caller: makeCaller() });
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect((next.mock.calls[0][0] as AppError).statusCode).toBe(500);
    });

    it('returns 401 when bearer token does not match INTERNAL_AUTH_TOKEN', async () => {
      process.env.INTERNAL_AUTH_TOKEN = VALID_INTERNAL_TOKEN;
      const middleware = createMiddleware();
      const req = createMockRequest({
        headers: { 'X-TENANT-ID': VALID_TENANT_ID, Authorization: 'Bearer wrong-token' },
        method: 'POST',
        originalUrl: '/rest/custom/v1/messages/',
      });
      const res = createMockResponse({ caller: makeCaller() });
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
    });

    it('allows internal POST when bearer matches INTERNAL_AUTH_TOKEN', async () => {
      process.env.INTERNAL_AUTH_TOKEN = VALID_INTERNAL_TOKEN;
      const middleware = createMiddleware();
      const req = createMockRequest({
        headers: {
          'X-TENANT-ID': VALID_TENANT_ID,
          Authorization: `Bearer ${VALID_INTERNAL_TOKEN}`,
        },
        method: 'POST',
        originalUrl: '/rest/custom/v1/messages/',
      });
      const res = createMockResponse({ caller: makeCaller() });
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(res.locals.chwfInternal).toBe(true);
      expect(res.locals.chwfAllowedProjectIds).toEqual([VALID_PROJECT_ID]);
    });

    it('validates bearer for POST /v1/actions as well', async () => {
      process.env.INTERNAL_AUTH_TOKEN = VALID_INTERNAL_TOKEN;
      const middleware = createMiddleware();
      const req = createMockRequest({
        headers: { 'X-TENANT-ID': VALID_TENANT_ID, Authorization: 'Bearer wrong' },
        method: 'POST',
        originalUrl: '/rest/custom/v1/actions',
      });
      const res = createMockResponse({ caller: makeCaller() });
      const next = createMockNext();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect((next.mock.calls[0][0] as AppError).statusCode).toBe(401);
    });
  });
});
