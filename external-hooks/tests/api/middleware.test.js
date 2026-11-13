'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const middlewares_1 = require('../../src/api/middlewares');
const mocks_1 = require('../helpers/mocks');
const test_utils_1 = require('../helpers/test-utils');
vitest_1.vi.mock('../../src/api/services/project-access', () => ({
  listProjectIdsAccessibleToUser: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, INTERNAL_AUTH_TOKEN: '' };
});
const project_access_1 = require('../../src/api/services/project-access');
const config = __importStar(require('@config'));
const mockedlistProjectIdsAccessibleToUser = vitest_1.vi.mocked(project_access_1.listProjectIdsAccessibleToUser);
const GLOBAL_OWNER_SLUG = 'global:owner';
const GLOBAL_ADMIN_SLUG = 'global:admin';
/* ================================================================== */
/*  apiKeyAuthMiddleware                                               */
/* ================================================================== */
(0, vitest_1.describe)('apiKeyAuthMiddleware', () => {
  (0, vitest_1.it)('sets res.locals.caller and calls next on valid API key', async () => {
    const apiKeyService = (0, mocks_1.createMockUserRepository)();
    const { apiKeyAuthMiddleware } = (0, middlewares_1.createAuthMiddleware)({
      userRepository: apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });
    const req = (0, mocks_1.createMockRequest)({ headers: { 'X-N8N-API-KEY': mocks_1.VALID_API_KEY } });
    const res = (0, mocks_1.createMockResponse)();
    const next = (0, mocks_1.createMockNext)();
    await apiKeyAuthMiddleware(req, res, next);
    (0, vitest_1.expect)(res.locals.caller).toBeDefined();
    (0, vitest_1.expect)(next).toHaveBeenCalledWith();
  });
  (0, vitest_1.it)('returns 401 when no API key header', async () => {
    const apiKeyService = (0, mocks_1.createMockUserRepository)();
    const { apiKeyAuthMiddleware } = (0, middlewares_1.createAuthMiddleware)({
      userRepository: apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });
    const req = (0, mocks_1.createMockRequest)({ headers: {} });
    const res = (0, mocks_1.createMockResponse)();
    const next = (0, mocks_1.createMockNext)();
    await apiKeyAuthMiddleware(req, res, next);
    (0, test_utils_1.expectNextAppError)(next, 401);
  });
  (0, vitest_1.it)('returns 401 when getUserForApiKey returns null', async () => {
    const apiKeyService = (0, mocks_1.createMockUserRepository)();
    apiKeyService.getUserForApiKey.mockResolvedValue(null);
    const { apiKeyAuthMiddleware } = (0, middlewares_1.createAuthMiddleware)({
      userRepository: apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });
    const req = (0, mocks_1.createMockRequest)({ headers: { 'X-N8N-API-KEY': 'bad-key' } });
    const res = (0, mocks_1.createMockResponse)();
    const next = (0, mocks_1.createMockNext)();
    await apiKeyAuthMiddleware(req, res, next);
    (0, test_utils_1.expectNextAppError)(next, 401);
  });
  (0, vitest_1.it)('returns 401 when user is disabled', async () => {
    const apiKeyService = (0, mocks_1.createMockUserRepository)();
    apiKeyService.getUserForApiKey.mockResolvedValue((0, mocks_1.makeCaller)({ disabled: true }));
    const { apiKeyAuthMiddleware } = (0, middlewares_1.createAuthMiddleware)({
      userRepository: apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });
    const req = (0, mocks_1.createMockRequest)({ headers: { 'X-N8N-API-KEY': mocks_1.VALID_API_KEY } });
    const res = (0, mocks_1.createMockResponse)();
    const next = (0, mocks_1.createMockNext)();
    await apiKeyAuthMiddleware(req, res, next);
    (0, test_utils_1.expectNextAppError)(next, 401);
  });
  (0, vitest_1.it)('returns 401 when getUserForApiKey throws', async () => {
    const apiKeyService = (0, mocks_1.createMockUserRepository)();
    apiKeyService.getUserForApiKey.mockRejectedValue(new Error('DB down'));
    const { apiKeyAuthMiddleware } = (0, middlewares_1.createAuthMiddleware)({
      userRepository: apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });
    const req = (0, mocks_1.createMockRequest)({ headers: { 'X-N8N-API-KEY': mocks_1.VALID_API_KEY } });
    const res = (0, mocks_1.createMockResponse)();
    const next = (0, mocks_1.createMockNext)();
    await apiKeyAuthMiddleware(req, res, next);
    (0, test_utils_1.expectNextAppError)(next, 401);
  });
});
/* ================================================================== */
/*  adminAuthMiddleware                                                */
/* ================================================================== */
(0, vitest_1.describe)('adminAuthMiddleware', () => {
  (0, vitest_1.it)('calls next for global owner role', async () => {
    const apiKeyService = (0, mocks_1.createMockUserRepository)();
    apiKeyService.getUserForApiKey.mockResolvedValue((0, mocks_1.makeAdminCaller)(GLOBAL_OWNER_SLUG));
    const { adminAuthMiddleware } = (0, middlewares_1.createAuthMiddleware)({
      userRepository: apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });
    const req = (0, mocks_1.createMockRequest)({ headers: { 'X-N8N-API-KEY': mocks_1.VALID_API_KEY } });
    const res = (0, mocks_1.createMockResponse)();
    const next = (0, mocks_1.createMockNext)();
    await adminAuthMiddleware(req, res, next);
    // next should be called without an error argument
    const lastCall = next.mock.calls[next.mock.calls.length - 1];
    (0, vitest_1.expect)(lastCall[0]).toBeUndefined();
  });
  (0, vitest_1.it)('calls next for global admin role', async () => {
    const apiKeyService = (0, mocks_1.createMockUserRepository)();
    apiKeyService.getUserForApiKey.mockResolvedValue((0, mocks_1.makeAdminCaller)(GLOBAL_ADMIN_SLUG));
    const { adminAuthMiddleware } = (0, middlewares_1.createAuthMiddleware)({
      userRepository: apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });
    const req = (0, mocks_1.createMockRequest)({ headers: { 'X-N8N-API-KEY': mocks_1.VALID_API_KEY } });
    const res = (0, mocks_1.createMockResponse)();
    const next = (0, mocks_1.createMockNext)();
    await adminAuthMiddleware(req, res, next);
    const lastCall = next.mock.calls[next.mock.calls.length - 1];
    (0, vitest_1.expect)(lastCall[0]).toBeUndefined();
  });
  (0, vitest_1.it)('returns 403 for non-admin role', async () => {
    const apiKeyService = (0, mocks_1.createMockUserRepository)();
    apiKeyService.getUserForApiKey.mockResolvedValue((0, mocks_1.makeCaller)({ role: { slug: 'global:member' } }));
    const { adminAuthMiddleware } = (0, middlewares_1.createAuthMiddleware)({
      userRepository: apiKeyService,
      globalOwnerRoleSlug: GLOBAL_OWNER_SLUG,
      globalAdminRoleSlug: GLOBAL_ADMIN_SLUG,
    });
    const req = (0, mocks_1.createMockRequest)({ headers: { 'X-N8N-API-KEY': mocks_1.VALID_API_KEY } });
    const res = (0, mocks_1.createMockResponse)();
    const next = (0, mocks_1.createMockNext)();
    await adminAuthMiddleware(req, res, next);
    (0, test_utils_1.expectNextAppError)(next, 403);
  });
});
/* ================================================================== */
/*  createWorkflowInteractionTenantMiddleware                          */
/* ================================================================== */
(0, vitest_1.describe)('createWorkflowInteractionTenantMiddleware', () => {
  function createMiddleware(overrides = {}) {
    const projectRepo = {
      getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue({ id: mocks_1.VALID_PROJECT_ID }),
      ...(overrides.projectRepo ?? {}),
    };
    const projectRelationRepo = {
      findAllByUser: vitest_1.vi.fn().mockResolvedValue([{ projectId: mocks_1.VALID_PROJECT_ID }]),
      ...(overrides.projectRelationRepo ?? {}),
    };
    const tenantProjectRelationRepo = {
      getProjectIdsByTenantId: vitest_1.vi.fn().mockResolvedValue([mocks_1.VALID_PROJECT_ID]),
      ...(overrides.tenantProjectRelationRepo ?? {}),
    };
    mockedlistProjectIdsAccessibleToUser.mockResolvedValue([mocks_1.VALID_PROJECT_ID]);
    return (0, middlewares_1.createWorkflowInteractionTenantMiddleware)({
      n8nRepositories: { project: projectRepo, projectRelation: projectRelationRepo },
      customRepositories: { tenantProjectRelation: tenantProjectRelationRepo },
    });
  }
  (0, vitest_1.it)('sets chwfAllowedProjectIds on valid tenant + user scope', async () => {
    const middleware = createMiddleware();
    const req = (0, mocks_1.createMockRequest)({
      headers: { 'X-TENANT-ID': mocks_1.VALID_TENANT_ID },
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = (0, mocks_1.createMockResponse)({ caller: (0, mocks_1.makeCaller)() });
    const next = (0, mocks_1.createMockNext)();
    await middleware(req, res, next);
    (0, vitest_1.expect)(res.locals.chwfAllowedProjectIds).toEqual([mocks_1.VALID_PROJECT_ID]);
    (0, vitest_1.expect)(res.locals.chwfTenantId).toBe(mocks_1.VALID_TENANT_ID);
    (0, vitest_1.expect)(next).toHaveBeenCalledWith();
  });
  (0, vitest_1.it)('returns 400 when X-TENANT-ID header is missing', async () => {
    const middleware = createMiddleware();
    const req = (0, mocks_1.createMockRequest)({
      headers: {},
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = (0, mocks_1.createMockResponse)({ caller: (0, mocks_1.makeCaller)() });
    const next = (0, mocks_1.createMockNext)();
    await middleware(req, res, next);
    (0, test_utils_1.expectNextAppError)(next, 400);
  });
  (0, vitest_1.it)('returns 400 when tenant ID is not a valid UUID', async () => {
    const middleware = createMiddleware();
    const req = (0, mocks_1.createMockRequest)({
      headers: { 'X-TENANT-ID': 'not-a-uuid' },
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = (0, mocks_1.createMockResponse)({ caller: (0, mocks_1.makeCaller)() });
    const next = (0, mocks_1.createMockNext)();
    await middleware(req, res, next);
    (0, test_utils_1.expectNextAppError)(next, 400);
  });
  (0, vitest_1.it)('returns 403 when tenant has no projects', async () => {
    const middleware = createMiddleware({
      tenantProjectRelationRepo: {
        getProjectIdsByTenantId: vitest_1.vi.fn().mockResolvedValue([]),
      },
    });
    const req = (0, mocks_1.createMockRequest)({
      headers: { 'X-TENANT-ID': mocks_1.VALID_TENANT_ID },
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = (0, mocks_1.createMockResponse)({ caller: (0, mocks_1.makeCaller)() });
    const next = (0, mocks_1.createMockNext)();
    await middleware(req, res, next);
    (0, test_utils_1.expectNextAppError)(next, 403);
  });
  (0, vitest_1.it)('returns 403 when intersection of tenant and user projects is empty', async () => {
    const middleware = createMiddleware();
    mockedlistProjectIdsAccessibleToUser.mockResolvedValue(['other-proj']);
    const req = (0, mocks_1.createMockRequest)({
      headers: { 'X-TENANT-ID': mocks_1.VALID_TENANT_ID },
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = (0, mocks_1.createMockResponse)({ caller: (0, mocks_1.makeCaller)() });
    const next = (0, mocks_1.createMockNext)();
    await middleware(req, res, next);
    (0, test_utils_1.expectNextAppError)(next, 403);
  });
  (0, vitest_1.it)('returns 401 when caller.id is missing', async () => {
    const middleware = createMiddleware();
    const req = (0, mocks_1.createMockRequest)({
      headers: { 'X-TENANT-ID': mocks_1.VALID_TENANT_ID },
      method: 'GET',
      originalUrl: '/rest/custom/v1/messages/',
    });
    const res = (0, mocks_1.createMockResponse)({ caller: undefined });
    const next = (0, mocks_1.createMockNext)();
    await middleware(req, res, next);
    (0, test_utils_1.expectNextAppError)(next, 401);
  });
  (0, vitest_1.describe)('internal POST bearer validation', () => {
    (0, vitest_1.afterEach)(() => {
      vitest_1.vi.mocked(config).INTERNAL_AUTH_TOKEN = '';
    });
    (0, vitest_1.it)('returns 500 when INTERNAL_AUTH_TOKEN not configured for internal POST', async () => {
      vitest_1.vi.mocked(config).INTERNAL_AUTH_TOKEN = '';
      const middleware = createMiddleware();
      const req = (0, mocks_1.createMockRequest)({
        headers: { 'X-TENANT-ID': mocks_1.VALID_TENANT_ID, Authorization: `Bearer ${mocks_1.VALID_INTERNAL_TOKEN}` },
        method: 'POST',
        originalUrl: '/rest/custom/v1/messages/',
      });
      const res = (0, mocks_1.createMockResponse)({ caller: (0, mocks_1.makeCaller)() });
      const next = (0, mocks_1.createMockNext)();
      await middleware(req, res, next);
      (0, test_utils_1.expectNextAppError)(next, 500);
    });
    (0, vitest_1.it)('returns 401 when bearer token does not match INTERNAL_AUTH_TOKEN', async () => {
      vitest_1.vi.mocked(config).INTERNAL_AUTH_TOKEN = mocks_1.VALID_INTERNAL_TOKEN;
      const middleware = createMiddleware();
      const req = (0, mocks_1.createMockRequest)({
        headers: { 'X-TENANT-ID': mocks_1.VALID_TENANT_ID, Authorization: 'Bearer wrong-token' },
        method: 'POST',
        originalUrl: '/rest/custom/v1/messages/',
      });
      const res = (0, mocks_1.createMockResponse)({ caller: (0, mocks_1.makeCaller)() });
      const next = (0, mocks_1.createMockNext)();
      await middleware(req, res, next);
      (0, test_utils_1.expectNextAppError)(next, 401);
    });
    (0, vitest_1.it)('allows internal POST when bearer matches INTERNAL_AUTH_TOKEN', async () => {
      vitest_1.vi.mocked(config).INTERNAL_AUTH_TOKEN = mocks_1.VALID_INTERNAL_TOKEN;
      const middleware = createMiddleware();
      const req = (0, mocks_1.createMockRequest)({
        headers: {
          'X-TENANT-ID': mocks_1.VALID_TENANT_ID,
          Authorization: `Bearer ${mocks_1.VALID_INTERNAL_TOKEN}`,
        },
        method: 'POST',
        originalUrl: '/rest/custom/v1/messages/',
      });
      const res = (0, mocks_1.createMockResponse)({ caller: (0, mocks_1.makeCaller)() });
      const next = (0, mocks_1.createMockNext)();
      await middleware(req, res, next);
      (0, vitest_1.expect)(res.locals.chwfInternal).toBe(true);
      (0, vitest_1.expect)(res.locals.chwfAllowedProjectIds).toEqual([mocks_1.VALID_PROJECT_ID]);
    });
    (0, vitest_1.it)('validates bearer for POST /v1/actions as well', async () => {
      vitest_1.vi.mocked(config).INTERNAL_AUTH_TOKEN = mocks_1.VALID_INTERNAL_TOKEN;
      const middleware = createMiddleware();
      const req = (0, mocks_1.createMockRequest)({
        headers: { 'X-TENANT-ID': mocks_1.VALID_TENANT_ID, Authorization: 'Bearer wrong' },
        method: 'POST',
        originalUrl: '/rest/custom/v1/actions',
      });
      const res = (0, mocks_1.createMockResponse)({ caller: (0, mocks_1.makeCaller)() });
      const next = (0, mocks_1.createMockNext)();
      await middleware(req, res, next);
      (0, test_utils_1.expectNextAppError)(next, 401);
    });
  });
});
