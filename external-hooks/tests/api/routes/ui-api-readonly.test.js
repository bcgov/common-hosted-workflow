'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const { getUiSessionMock } = vitest_1.vi.hoisted(() => ({ getUiSessionMock: vitest_1.vi.fn() }));
vitest_1.vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, READONLY_MODE: true };
});
vitest_1.vi.mock('../../../src/api/helpers/ui-oidc-session', async () => {
  const actual = await vitest_1.vi.importActual('../../../src/api/helpers/ui-oidc-session');
  return { ...actual, getUiSession: getUiSessionMock };
});
const ui_api_1 = require('../../../src/api/routes/ui-api');
const errors_1 = require('../../../src/api/utils/errors');
const services = {
  tenant: {
    getTenantRolesForSession: vitest_1.vi.fn().mockResolvedValue({ roles: [] }),
    getTenantGroupsForSession: vitest_1.vi.fn().mockResolvedValue({ groups: [] }),
  },
  featureFlag: {
    isFeatureEnabled: vitest_1.vi.fn((flag) => flag === 'wil'),
    getAllFlags: vitest_1.vi.fn().mockReturnValue({}),
  },
  uiApi: {
    loadUserContext: vitest_1.vi.fn().mockResolvedValue({
      n8nUser: {
        id: 'user-123',
        email: 'person@example.com',
        disabled: false,
        role: { slug: 'global:member', displayName: 'Member' },
      },
      accessibleProjectIds: [],
      projects: [],
      workflows: [],
    }),
  },
};
function dispatch(method, url) {
  const router = (0, ui_api_1.buildUiApiRouter)({ services });
  return new Promise((resolve) => {
    const res = {
      status: vitest_1.vi.fn().mockReturnThis(),
      json: vitest_1.vi.fn(() => resolve({ error: null, responded: true })),
      setHeader: vitest_1.vi.fn(),
      end: vitest_1.vi.fn(() => resolve({ error: null, responded: true })),
    };
    router.handle({ method, url, path: url, headers: { authorization: 'Bearer token' }, query: {} }, res, (error) =>
      resolve({ error, responded: false }),
    );
  });
}
(0, vitest_1.beforeEach)(() => {
  getUiSessionMock.mockResolvedValue({
    session: {
      subject: 'sub-1',
      email: 'person@example.com',
      issuer: 'https://issuer.example.com',
      audience: ['app'],
      claims: {},
    },
    upstreamAccessToken: 'upstream-token',
  });
});
(0, vitest_1.describe)('GET/POST /ui-api/wil in read-only mode', () => {
  vitest_1.it.each([
    ['POST', '/wil/actions/action-1/claim'],
    ['POST', '/wil/actions/action-1/unclaim'],
    ['POST', '/wil/actions/action-1/start'],
    ['POST', '/wil/callback'],
    ['POST', '/wil/triggers'],
    ['PUT', '/wil/triggers/trigger-1'],
    ['DELETE', '/wil/triggers/trigger-1'],
    ['POST', '/wil/triggers/trigger-1/callback'],
    ['POST', '/wil/chefs-credentials'],
    ['PATCH', '/wil/chefs-credentials/credential-1'],
  ])('answers %s %s with a maintenance 503', async (method, url) => {
    const { error, responded } = await dispatch(method, url);
    (0, vitest_1.expect)(responded).toBe(false);
    (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
    (0, vitest_1.expect)(error.statusCode).toBe(503);
  });
  vitest_1.it.each([
    ['GET', '/wil/tenants'],
    ['GET', '/wil/actions'],
    ['GET', '/wil/triggers'],
  ])('does not answer %s %s with a maintenance error', async (method, url) => {
    const { error } = await dispatch(method, url);
    (0, vitest_1.expect)(error instanceof errors_1.AppError && error.statusCode === 503).toBe(false);
  });
});
