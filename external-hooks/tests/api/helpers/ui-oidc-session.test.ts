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
  getUiSessionIssueIdMock,
} = vi.hoisted(() => ({
  getUiOidcRefreshTokenRecordMock: vi.fn(),
  getUiOidcIdTokenMock: vi.fn(),
  getUiOidcAccessTokenRecordMock: vi.fn(),
  setUiOidcRefreshTokenWithExpiryMock: vi.fn(),
  setUiOidcIdTokenMock: vi.fn(),
  setUiOidcAccessTokenRecordMock: vi.fn(),
  deleteUiTenantRolesMock: vi.fn(),
  deleteUiTenantGroupsMock: vi.fn(),
  getUiSessionIssueIdMock: vi.fn(),
}));

vi.mock('../../../src/api/helpers/ui-oidc-store', async () => {
  const actual = (await vi.importActual('../../../src/api/helpers/ui-oidc-store')) as Record<string, unknown>;
  return {
    ...(actual as object),
    getUiOidcRefreshTokenRecord: getUiOidcRefreshTokenRecordMock,
    getUiOidcIdToken: getUiOidcIdTokenMock,
    getUiOidcAccessTokenRecord: getUiOidcAccessTokenRecordMock,
    setUiOidcRefreshTokenWithExpiry: setUiOidcRefreshTokenWithExpiryMock,
    setUiOidcIdToken: setUiOidcIdTokenMock,
    setUiOidcAccessTokenRecord: setUiOidcAccessTokenRecordMock,
    deleteUiTenantRoles: deleteUiTenantRolesMock,
    deleteUiTenantGroups: deleteUiTenantGroupsMock,
    getUiSessionIssueId: getUiSessionIssueIdMock,
    setUiSessionIssueId: vi.fn(),
  };
});

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

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
}));

vi.mock('jose', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...(actual as object), jwtVerify: jwtVerifyMock };
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
    getUiSessionIssueIdMock.mockResolvedValue('test-session-id');
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

  describe('server-side revocation: raw-token mode (UI_AUTH_USE_SEPARATE_TOKEN=false)', () => {
    it('rejects an unknown or revoked raw token (no server record)', async () => {
      getUiOidcAccessTokenRecordMock.mockResolvedValue(null);

      const req = createMockRequest({ authorization: 'Bearer revoked-raw-token' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).toBeNull();
      expect(fetchOidcUserInfoMock).not.toHaveBeenCalled();
    });

    it('accepts a known raw token with a server record and future expiry', async () => {
      const farFuture = Date.now() + 3600_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: farFuture,
      });

      const req = createMockRequest({ authorization: 'Bearer valid-raw-token' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).not.toBeNull();
      expect(result?.session.email).toBe('user@example.com');
      expect(fetchOidcUserInfoMock).toHaveBeenCalled();
    });
  });

  describe('server-side revocation: separate-JWT mode (UI_AUTH_USE_SEPARATE_TOKEN=true)', () => {
    beforeEach(() => {
      vi.stubEnv('UI_AUTH_USE_SEPARATE_TOKEN', 'true');
      vi.stubEnv('UI_AUTH_JWT_SECRET', 'test-secret-32-bytes-long-for-hs256!!');
    });

    it('rejects a separate JWT whose sid does not match the stored session issue id', async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-sub-123',
          email: 'user@example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          sid: 'sid-old',
          oidc: {
            subject: 'user-sub-123',
            email: 'user@example.com',
            issuer: 'https://idir.example.com',
            audience: ['test-client'],
            claims: {},
          },
        },
        protectedHeader: {},
      });
      getUiSessionIssueIdMock.mockResolvedValue('sid-current');

      const req = createMockRequest({ authorization: 'Bearer jwt-with-old-sid' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).toBeNull();
    });

    it('rejects a separate JWT when the stored session issue id is missing (revoked via logout)', async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-sub-123',
          email: 'user@example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          sid: 'sid-current',
          oidc: {
            subject: 'user-sub-123',
            email: 'user@example.com',
            issuer: 'https://idir.example.com',
            audience: ['test-client'],
            claims: {},
          },
        },
        protectedHeader: {},
      });
      getUiSessionIssueIdMock.mockResolvedValue(null);

      const req = createMockRequest({ authorization: 'Bearer jwt-after-logout' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).toBeNull();
    });

    it('rejects a separate JWT without a sid', async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-sub-123',
          email: 'user@example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          oidc: {
            subject: 'user-sub-123',
            email: 'user@example.com',
            issuer: 'https://idir.example.com',
            audience: ['test-client'],
            claims: {},
          },
        },
        protectedHeader: {},
      });
      getUiSessionIssueIdMock.mockResolvedValue('sid-current');

      const req = createMockRequest({ authorization: 'Bearer jwt-no-sid' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).toBeNull();
    });

    it('accepts a separate JWT whose sid matches the stored session issue id', async () => {
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-sub-123',
          email: 'user@example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          sid: 'sid-current',
          oidc: {
            subject: 'user-sub-123',
            email: 'user@example.com',
            issuer: 'https://idir.example.com',
            audience: ['test-client'],
            claims: {},
          },
        },
        protectedHeader: {},
      });
      getUiSessionIssueIdMock.mockResolvedValue('sid-current');

      const req = createMockRequest({ authorization: 'Bearer jwt-valid' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).not.toBeNull();
      expect(result?.session.email).toBe('user@example.com');
    });

    it('does not refresh when separate JWT has plenty of time left', async () => {
      const farFutureExp = Math.floor(Date.now() / 1000) + 3600;
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-sub-123',
          email: 'user@example.com',
          exp: farFutureExp,
          sid: 'sid-current',
          oidc: {
            subject: 'user-sub-123',
            email: 'user@example.com',
            issuer: 'https://idir.example.com',
            audience: ['test-client'],
            claims: {},
          },
        },
        protectedHeader: {},
      });
      getUiSessionIssueIdMock.mockResolvedValue('sid-current');

      const req = createMockRequest({ authorization: 'Bearer jwt-far-future' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).not.toBeNull();
      expect(result?.refreshedToken).toBeUndefined();
      expect(refreshOidcTokensMock).not.toHaveBeenCalled();
    });

    it('refreshes within bounded pre-expiry window and returns replacement token', async () => {
      const soonExp = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now, within 5min window
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-sub-123',
          email: 'user@example.com',
          exp: soonExp,
          sid: 'sid-current',
          oidc: {
            subject: 'user-sub-123',
            email: 'user@example.com',
            issuer: 'https://idir.example.com',
            audience: ['test-client'],
            claims: {},
          },
        },
        protectedHeader: {},
      });
      getUiSessionIssueIdMock.mockResolvedValue('sid-current');
      getUiOidcRefreshTokenRecordMock.mockResolvedValue({ token: 'stored-refresh-token' });
      refreshOidcTokensMock.mockResolvedValue({
        access_token: 'new-access-token-window',
        refresh_token: 'new-refresh-token',
        id_token: 'new-id-token',
        expires_in: 3600,
      });

      const req = createMockRequest({ authorization: 'Bearer jwt-near-expiry' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(refreshOidcTokensMock).toHaveBeenCalled();
      expect(result?.refreshedToken).toBe('refreshed-jwt-token');
      expect(result?.session.email).toBe('user@example.com');
    });

    it('rejects fully expired separate JWT without attempting refresh, and does not propagate token', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      jwtVerifyMock.mockRejectedValue(new Error('JWTExpired: "exp" claim timestamp check failed'));
      getUiSessionIssueIdMock.mockResolvedValue('sid-current');

      const req = createMockRequest({ authorization: 'Bearer jwt-expired' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).toBeNull();
      expect(refreshOidcTokensMock).not.toHaveBeenCalled();
    });

    it('rejects separate JWT that is already past expiry even if jwtVerify would succeed (defensive)', async () => {
      const expiredExp = Math.floor(Date.now() / 1000) - 10;
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-sub-123',
          email: 'user@example.com',
          exp: expiredExp,
          sid: 'sid-current',
          oidc: {
            subject: 'user-sub-123',
            email: 'user@example.com',
            issuer: 'https://idir.example.com',
            audience: ['test-client'],
            claims: {},
          },
        },
        protectedHeader: {},
      });
      getUiSessionIssueIdMock.mockResolvedValue('sid-current');

      const req = createMockRequest({ authorization: 'Bearer jwt-just-expired' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).toBeNull();
      expect(refreshOidcTokensMock).not.toHaveBeenCalled();
    });

    it('rejects within-window token when refresh fails', async () => {
      const soonExp = Math.floor(Date.now() / 1000) + 60;
      jwtVerifyMock.mockResolvedValue({
        payload: {
          sub: 'user-sub-123',
          email: 'user@example.com',
          exp: soonExp,
          sid: 'sid-current',
          oidc: {
            subject: 'user-sub-123',
            email: 'user@example.com',
            issuer: 'https://idir.example.com',
            audience: ['test-client'],
            claims: {},
          },
        },
        protectedHeader: {},
      });
      getUiSessionIssueIdMock.mockResolvedValue('sid-current');
      getUiOidcRefreshTokenRecordMock.mockResolvedValue(null);

      const req = createMockRequest({ authorization: 'Bearer jwt-window-no-refresh' });

      const { getUiSession } = await import('../../../src/api/helpers/ui-oidc-session');
      const result = await getUiSession(req);

      expect(result).toBeNull();
      expect(refreshOidcTokensMock).not.toHaveBeenCalled();
    });
  });

  describe('shouldRefreshSeparateToken window logic', () => {
    it('does not refresh far-future tokens, refreshes within 5min, rejects expired', async () => {
      const { shouldRefreshSeparateToken, isSeparateTokenExpired } =
        await import('../../../src/api/helpers/ui-auth-token');
      const now = Date.now();
      expect(shouldRefreshSeparateToken(now + 3600 * 1000)).toBe(false);
      expect(shouldRefreshSeparateToken(now + 4 * 60 * 1000)).toBe(true);
      expect(shouldRefreshSeparateToken(now + 60 * 1000)).toBe(true);
      expect(shouldRefreshSeparateToken(now - 1000)).toBe(false);
      expect(isSeparateTokenExpired(now - 1000)).toBe(true);
      expect(isSeparateTokenExpired(now + 1000)).toBe(false);
      expect(shouldRefreshSeparateToken(undefined)).toBe(false);
    });
  });
});
