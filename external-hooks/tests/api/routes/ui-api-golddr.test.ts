import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUiSessionMock } = vi.hoisted(() => ({ getUiSessionMock: vi.fn() }));

vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/config')>();
  return { ...original, IS_GOLDDR: true };
});

vi.mock('../../../src/api/helpers/ui-oidc-session', async () => {
  const actual = await vi.importActual<typeof import('../../../src/api/helpers/ui-oidc-session')>(
    '../../../src/api/helpers/ui-oidc-session',
  );
  return { ...actual, getUiSession: getUiSessionMock };
});

import { buildUiApiRouter } from '../../../src/api/routes/ui-api';
import { AppError } from '../../../src/api/utils/errors';

const services = {
  tenant: {
    getTenantRolesForSession: vi.fn().mockResolvedValue({ roles: [] }),
    getTenantGroupsForSession: vi.fn().mockResolvedValue({ groups: [] }),
  },
  featureFlag: { isFeatureEnabled: vi.fn((flag: string) => flag === 'wil'), getAllFlags: vi.fn().mockReturnValue({}) },
  uiApi: {
    loadUserContext: vi.fn().mockResolvedValue({
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

function dispatch(method: string, url: string) {
  const router = buildUiApiRouter({ services } as any);

  return new Promise<{ error: unknown; responded: boolean }>((resolve) => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(() => resolve({ error: null, responded: true })),
      setHeader: vi.fn(),
      end: vi.fn(() => resolve({ error: null, responded: true })),
    };
    (router as any).handle(
      { method, url, path: url, headers: { authorization: 'Bearer token' }, query: {} },
      res,
      (error: unknown) => resolve({ error, responded: false }),
    );
  });
}

beforeEach(() => {
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

describe('GET/POST /ui-api/wil on GoldDR', () => {
  it.each([
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

    expect(responded).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(503);
  });

  it.each([
    ['GET', '/wil/tenants'],
    ['GET', '/wil/actions'],
    ['GET', '/wil/triggers'],
  ])('does not answer %s %s with a maintenance error', async (method, url) => {
    const { error } = await dispatch(method, url);

    expect(error instanceof AppError && error.statusCode === 503).toBe(false);
  });
});
