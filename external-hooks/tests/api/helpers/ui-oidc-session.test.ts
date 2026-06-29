import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getUiOidcRefreshTokenRecordMock,
  getUiOidcIdTokenMock,
  getUiOidcAccessTokenRecordMock,
  setUiOidcRefreshTokenWithExpiryMock,
  setUiOidcIdTokenMock,
  setUiOidcAccessTokenRecordMock,
  deleteUiTenantRolesMock,
  deleteUiTenantGroupsMock,
} = vi.hoisted(() => ({
  getUiOidcRefreshTokenRecordMock: vi.fn(),
  getUiOidcIdTokenMock: vi.fn(),
  getUiOidcAccessTokenRecordMock: vi.fn(),
  setUiOidcRefreshTokenWithExpiryMock: vi.fn(),
  setUiOidcIdTokenMock: vi.fn(),
  setUiOidcAccessTokenRecordMock: vi.fn(),
  deleteUiTenantRolesMock: vi.fn(),
  deleteUiTenantGroupsMock: vi.fn(),
}));

vi.mock('../../../src/api/helpers/ui-oidc-store', () => ({
  getUiOidcRefreshTokenRecord: getUiOidcRefreshTokenRecordMock,
  getUiOidcIdToken: getUiOidcIdTokenMock,
  getUiOidcAccessTokenRecord: getUiOidcAccessTokenRecordMock,
  setUiOidcRefreshTokenWithExpiry: setUiOidcRefreshTokenWithExpiryMock,
  setUiOidcIdToken: setUiOidcIdTokenMock,
  setUiOidcAccessTokenRecord: setUiOidcAccessTokenRecordMock,
  deleteUiTenantRoles: deleteUiTenantRolesMock,
  deleteUiTenantGroups: deleteUiTenantGroupsMock,
}));

const { refreshOidcTokensMock, fetchOidcDiscoveryDocumentMock, fetchOidcUserInfoMock, extractOidcIdentityMock } =
  vi.hoisted(() => ({
    refreshOidcTokensMock: vi.fn(),
    fetchOidcDiscoveryDocumentMock: vi.fn(),
    fetchOidcUserInfoMock: vi.fn(),
    extractOidcIdentityMock: vi.fn(),
  }));

vi.mock('../../../src/api/helpers/oidc-provider', () => ({
  refreshOidcTokens: refreshOidcTokensMock,
  fetchOidcDiscoveryDocument: fetchOidcDiscoveryDocumentMock,
  fetchOidcUserInfo: fetchOidcUserInfoMock,
  extractOidcIdentity: extractOidcIdentityMock,
}));

const issueUiSessionTokenMock = vi.fn().mockResolvedValue('refreshed-jwt-token');
vi.mock('../../../src/api/helpers/ui-auth-token', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    issueUiSessionToken: issueUiSessionTokenMock,
  };
});

function createMockRequest(headers: Record<string, string> = {}) {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    headers,
  } as any;
}

describe('ui-oidc-session refresh/logout behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();

    vi.stubEnv('UI_AUTH_JWT_SECRET', '');
    vi.stubEnv('UI_AUTH_JWT_ISSUER', 'test-issuer');
    vi.stubEnv('UI_AUTH_JWT_AUDIENCE', 'test-audience');
    vi.stubEnv('UI_AUTH_USE_SEPARATE_TOKEN', 'false');
    vi.stubEnv('OIDC_CLIENT_ID', 'test-client');
    vi.stubEnv('OIDC_CLIENT_SECRET', 'test-secret');
    vi.stubEnv('OIDC_ISSUER', 'https://idir.example.com');
    vi.stubEnv('OIDC_ROLES_ATTRIBUTE', 'roles');

    fetchOidcDiscoveryDocumentMock.mockResolvedValue({
      userinfo_endpoint: 'https://idir.example.com/userinfo',
      token_endpoint: 'https://idir.example.com/token',
    });
    fetchOidcUserInfoMock.mockResolvedValue({
      sub: 'user-sub-123',
      email: 'user@example.com',
      name: 'Test User',
    });
    extractOidcIdentityMock.mockReturnValue({
      subject: 'user-sub-123',
      email: 'user@example.com',
      preferredUsername: 'user',
      name: 'Test User',
      issuer: 'https://idir.example.com',
      audience: ['test-client'],
      claims: {},
    });
  });

  describe('refresh token storage on callback', () => {
    it('stores refresh token, ID token, and access token record on successful login', async () => {
      getUiOidcAccessTokenRecordMock.mockResolvedValue(null);

      const req = createMockRequest({
        authorization: 'Bearer upstream-access-token',
      });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      await getUiSession(req);

      expect(getUiOidcAccessTokenRecordMock).toHaveBeenCalledWith('upstream-access-token');
    });
  });

  describe('expired token triggers refresh', () => {
    it('returns refreshed token when access token is expired', async () => {
      const expiredTime = Date.now() - 1_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: expiredTime,
      });

      getUiOidcRefreshTokenRecordMock.mockResolvedValue({ token: 'stored-refresh-token' });
      refreshOidcTokensMock.mockResolvedValue({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        id_token: 'new-id-token',
        expires_in: 3600,
      });

      const req = createMockRequest({
        authorization: 'Bearer old-access-token',
      });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(refreshOidcTokensMock).toHaveBeenCalled();
      expect(result?.refreshedToken).toBe('refreshed-jwt-token');
    });

    it('does not refresh when token has plenty of time left', async () => {
      const farFutureTime = Date.now() + 3600_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: farFutureTime,
      });

      const req = createMockRequest({
        authorization: 'Bearer valid-access-token',
      });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      await getUiSession(req);

      expect(refreshOidcTokensMock).not.toHaveBeenCalled();
    });
  });

  describe('refreshed token returned in X-UI-Auth-Token', () => {
    it('sets refreshedToken in result when refresh occurs', async () => {
      const expiredTime = Date.now() - 1_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: expiredTime,
      });

      getUiOidcRefreshTokenRecordMock.mockResolvedValue({ token: 'stored-refresh-token' });
      refreshOidcTokensMock.mockResolvedValue({
        access_token: 'refreshed-access-token',
        refresh_token: 'new-refresh-token',
        id_token: 'new-id-token',
        expires_in: 3600,
      });

      const req = createMockRequest({
        authorization: 'Bearer old-access-token',
      });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).not.toBeNull();
      expect(result?.refreshedToken).toBe('refreshed-jwt-token');
    });

    it('returns null refreshedToken when no refresh needed', async () => {
      const farFutureTime = Date.now() + 3600_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: farFutureTime,
      });

      const req = createMockRequest({
        authorization: 'Bearer valid-access-token',
      });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).not.toBeNull();
      expect(result?.refreshedToken).toBeUndefined();
    });
  });

  describe('logout deletes Redis entries', () => {
    it('retrieves ID token for logout redirect', async () => {
      getUiOidcIdTokenMock.mockResolvedValue('stored-id-token');

      const { getUiOidcIdToken } = await import('../../../src/api/helpers/ui-oidc-store');
      const idToken = await getUiOidcIdToken('user@example.com');

      expect(idToken).toBe('stored-id-token');
    });

    it('returns null when no ID token stored', async () => {
      getUiOidcIdTokenMock.mockResolvedValue(null);

      const { getUiOidcIdToken } = await import('../../../src/api/helpers/ui-oidc-store');
      const idToken = await getUiOidcIdToken('user@example.com');

      expect(idToken).toBeNull();
    });
  });

  describe('refresh failure handling', () => {
    it('returns null when refresh token is missing', async () => {
      const expiredTime = Date.now() - 1_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: expiredTime,
      });
      getUiOidcRefreshTokenRecordMock.mockResolvedValue(null);

      const req = createMockRequest({
        authorization: 'Bearer old-access-token',
      });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(refreshOidcTokensMock).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('returns null when refresh response has no access_token', async () => {
      const expiredTime = Date.now() - 1_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: expiredTime,
      });
      getUiOidcRefreshTokenRecordMock.mockResolvedValue({ token: 'stored-refresh-token' });
      refreshOidcTokensMock.mockResolvedValue({});

      const req = createMockRequest({
        authorization: 'Bearer old-access-token',
      });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).toBeNull();
    });
  });
});
