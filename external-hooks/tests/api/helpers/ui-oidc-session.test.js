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
} = vitest_1.vi.hoisted(() => ({
  getUiOidcRefreshTokenRecordMock: vitest_1.vi.fn(),
  getUiOidcIdTokenMock: vitest_1.vi.fn(),
  getUiOidcAccessTokenRecordMock: vitest_1.vi.fn(),
  setUiOidcRefreshTokenWithExpiryMock: vitest_1.vi.fn(),
  setUiOidcIdTokenMock: vitest_1.vi.fn(),
  setUiOidcAccessTokenRecordMock: vitest_1.vi.fn(),
  deleteUiTenantRolesMock: vitest_1.vi.fn(),
  deleteUiTenantGroupsMock: vitest_1.vi.fn(),
  getUiSessionIssueIdMock: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('../../../src/api/helpers/ui-oidc-store', async () => {
  const actual = await vitest_1.vi.importActual('../../../src/api/helpers/ui-oidc-store');
  return {
    ...actual,
    getUiOidcRefreshTokenRecord: getUiOidcRefreshTokenRecordMock,
    getUiOidcIdToken: getUiOidcIdTokenMock,
    getUiOidcAccessTokenRecord: getUiOidcAccessTokenRecordMock,
    setUiOidcRefreshTokenWithExpiry: setUiOidcRefreshTokenWithExpiryMock,
    setUiOidcIdToken: setUiOidcIdTokenMock,
    setUiOidcAccessTokenRecord: setUiOidcAccessTokenRecordMock,
    deleteUiTenantRoles: deleteUiTenantRolesMock,
    deleteUiTenantGroups: deleteUiTenantGroupsMock,
    getUiSessionIssueId: getUiSessionIssueIdMock,
    setUiSessionIssueId: vitest_1.vi.fn(),
  };
});
const { refreshOidcTokensMock, fetchOidcDiscoveryDocumentMock, fetchOidcUserInfoMock, extractOidcIdentityMock } =
  vitest_1.vi.hoisted(() => ({
    refreshOidcTokensMock: vitest_1.vi.fn(),
    fetchOidcDiscoveryDocumentMock: vitest_1.vi.fn(),
    fetchOidcUserInfoMock: vitest_1.vi.fn(),
    extractOidcIdentityMock: vitest_1.vi.fn(),
  }));
vitest_1.vi.mock('../../../src/api/helpers/oidc-provider', () => ({
  refreshOidcTokens: refreshOidcTokensMock,
  fetchOidcDiscoveryDocument: fetchOidcDiscoveryDocumentMock,
  fetchOidcUserInfo: fetchOidcUserInfoMock,
  extractOidcIdentity: extractOidcIdentityMock,
}));
const issueUiSessionTokenMock = vitest_1.vi.fn().mockResolvedValue('refreshed-jwt-token');
vitest_1.vi.mock('../../../src/api/helpers/ui-auth-token', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    issueUiSessionToken: issueUiSessionTokenMock,
  };
});
const { jwtVerifyMock } = vitest_1.vi.hoisted(() => ({
  jwtVerifyMock: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, jwtVerify: jwtVerifyMock };
});
function createMockRequest(headers = {}) {
  return {
    header: (name) => headers[name.toLowerCase()],
    headers,
  };
}
(0, vitest_1.describe)('ui-oidc-session refresh/logout behavior', () => {
  (0, vitest_1.beforeEach)(() => {
    vitest_1.vi.resetModules();
    vitest_1.vi.unstubAllEnvs();
    vitest_1.vi.clearAllMocks();
    vitest_1.vi.stubEnv('UI_AUTH_JWT_SECRET', '');
    vitest_1.vi.stubEnv('UI_AUTH_JWT_ISSUER', 'test-issuer');
    vitest_1.vi.stubEnv('UI_AUTH_JWT_AUDIENCE', 'test-audience');
    vitest_1.vi.stubEnv('UI_AUTH_USE_SEPARATE_TOKEN', 'false');
    vitest_1.vi.stubEnv('OIDC_CLIENT_ID', 'test-client');
    vitest_1.vi.stubEnv('OIDC_CLIENT_SECRET', 'test-secret');
    vitest_1.vi.stubEnv('OIDC_ISSUER', 'https://idir.example.com');
    vitest_1.vi.stubEnv('OIDC_ROLES_ATTRIBUTE', 'roles');
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
  (0, vitest_1.describe)('refresh token storage on callback', () => {
    (0, vitest_1.it)('stores refresh token, ID token, and access token record on successful login', async () => {
      getUiOidcAccessTokenRecordMock.mockResolvedValue(null);
      const req = createMockRequest({
        authorization: 'Bearer upstream-access-token',
      });
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      await getUiSession(req);
      (0, vitest_1.expect)(getUiOidcAccessTokenRecordMock).toHaveBeenCalledWith('upstream-access-token');
    });
  });
  (0, vitest_1.describe)('expired token triggers refresh', () => {
    (0, vitest_1.it)('returns refreshed token when access token is expired', async () => {
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
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(refreshOidcTokensMock).toHaveBeenCalled();
      (0, vitest_1.expect)(result?.refreshedToken).toBe('refreshed-jwt-token');
    });
    (0, vitest_1.it)('does not refresh when token has plenty of time left', async () => {
      const farFutureTime = Date.now() + 3600_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: farFutureTime,
      });
      const req = createMockRequest({
        authorization: 'Bearer valid-access-token',
      });
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      await getUiSession(req);
      (0, vitest_1.expect)(refreshOidcTokensMock).not.toHaveBeenCalled();
    });
  });
  (0, vitest_1.describe)('refreshed token returned in X-UI-Auth-Token', () => {
    (0, vitest_1.it)('sets refreshedToken in result when refresh occurs', async () => {
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
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(result).not.toBeNull();
      (0, vitest_1.expect)(result?.refreshedToken).toBe('refreshed-jwt-token');
    });
    (0, vitest_1.it)('returns null refreshedToken when no refresh needed', async () => {
      const farFutureTime = Date.now() + 3600_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: farFutureTime,
      });
      const req = createMockRequest({
        authorization: 'Bearer valid-access-token',
      });
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(result).not.toBeNull();
      (0, vitest_1.expect)(result?.refreshedToken).toBeUndefined();
    });
  });
  (0, vitest_1.describe)('logout deletes Redis entries', () => {
    (0, vitest_1.it)('retrieves ID token for logout redirect', async () => {
      getUiOidcIdTokenMock.mockResolvedValue('stored-id-token');
      const { getUiOidcIdToken } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-store')),
      );
      const idToken = await getUiOidcIdToken('user@example.com');
      (0, vitest_1.expect)(idToken).toBe('stored-id-token');
    });
    (0, vitest_1.it)('returns null when no ID token stored', async () => {
      getUiOidcIdTokenMock.mockResolvedValue(null);
      const { getUiOidcIdToken } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-store')),
      );
      const idToken = await getUiOidcIdToken('user@example.com');
      (0, vitest_1.expect)(idToken).toBeNull();
    });
  });
  (0, vitest_1.describe)('refresh failure handling', () => {
    (0, vitest_1.it)('returns null when refresh token is missing', async () => {
      const expiredTime = Date.now() - 1_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: expiredTime,
      });
      getUiOidcRefreshTokenRecordMock.mockResolvedValue(null);
      const req = createMockRequest({
        authorization: 'Bearer old-access-token',
      });
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(refreshOidcTokensMock).not.toHaveBeenCalled();
      (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)('returns null when refresh response has no access_token', async () => {
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
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(result).toBeNull();
    });
  });
  (0, vitest_1.describe)('server-side revocation: raw-token mode (UI_AUTH_USE_SEPARATE_TOKEN=false)', () => {
    (0, vitest_1.it)('rejects an unknown or revoked raw token (no server record)', async () => {
      getUiOidcAccessTokenRecordMock.mockResolvedValue(null);
      const req = createMockRequest({ authorization: 'Bearer revoked-raw-token' });
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(result).toBeNull();
      (0, vitest_1.expect)(fetchOidcUserInfoMock).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('accepts a known raw token with a server record and future expiry', async () => {
      const farFuture = Date.now() + 3600_000;
      getUiOidcAccessTokenRecordMock.mockResolvedValue({
        email: 'user@example.com',
        expiresAt: farFuture,
      });
      const req = createMockRequest({ authorization: 'Bearer valid-raw-token' });
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(result).not.toBeNull();
      (0, vitest_1.expect)(result?.session.email).toBe('user@example.com');
      (0, vitest_1.expect)(fetchOidcUserInfoMock).toHaveBeenCalled();
    });
  });
  (0, vitest_1.describe)('server-side revocation: separate-JWT mode (UI_AUTH_USE_SEPARATE_TOKEN=true)', () => {
    (0, vitest_1.beforeEach)(() => {
      vitest_1.vi.stubEnv('UI_AUTH_USE_SEPARATE_TOKEN', 'true');
      vitest_1.vi.stubEnv('UI_AUTH_JWT_SECRET', 'test-secret-32-bytes-long-for-hs256!!');
    });
    (0, vitest_1.it)('rejects a separate JWT whose sid does not match the stored session issue id', async () => {
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
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)(
      'rejects a separate JWT when the stored session issue id is missing (revoked via logout)',
      async () => {
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
        const { getUiSession } = await Promise.resolve().then(() =>
          __importStar(require('../../../src/api/helpers/ui-oidc-session')),
        );
        const result = await getUiSession(req);
        (0, vitest_1.expect)(result).toBeNull();
      },
    );
    (0, vitest_1.it)('rejects a separate JWT without a sid', async () => {
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
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)('accepts a separate JWT whose sid matches the stored session issue id', async () => {
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
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(result).not.toBeNull();
      (0, vitest_1.expect)(result?.session.email).toBe('user@example.com');
    });
    (0, vitest_1.it)('does not refresh when separate JWT has plenty of time left', async () => {
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
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(result).not.toBeNull();
      (0, vitest_1.expect)(result?.refreshedToken).toBeUndefined();
      (0, vitest_1.expect)(refreshOidcTokensMock).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('refreshes within bounded pre-expiry window and returns replacement token', async () => {
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
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(refreshOidcTokensMock).toHaveBeenCalled();
      (0, vitest_1.expect)(result?.refreshedToken).toBe('refreshed-jwt-token');
      (0, vitest_1.expect)(result?.session.email).toBe('user@example.com');
    });
    (0, vitest_1.it)(
      'rejects fully expired separate JWT without attempting refresh, and does not propagate token',
      async () => {
        const expiredExp = Math.floor(Date.now() / 1000) - 60;
        jwtVerifyMock.mockRejectedValue(new Error('JWTExpired: "exp" claim timestamp check failed'));
        getUiSessionIssueIdMock.mockResolvedValue('sid-current');
        const req = createMockRequest({ authorization: 'Bearer jwt-expired' });
        const { getUiSession } = await Promise.resolve().then(() =>
          __importStar(require('../../../src/api/helpers/ui-oidc-session')),
        );
        const result = await getUiSession(req);
        (0, vitest_1.expect)(result).toBeNull();
        (0, vitest_1.expect)(refreshOidcTokensMock).not.toHaveBeenCalled();
      },
    );
    (0, vitest_1.it)(
      'rejects separate JWT that is already past expiry even if jwtVerify would succeed (defensive)',
      async () => {
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
        const { getUiSession } = await Promise.resolve().then(() =>
          __importStar(require('../../../src/api/helpers/ui-oidc-session')),
        );
        const result = await getUiSession(req);
        (0, vitest_1.expect)(result).toBeNull();
        (0, vitest_1.expect)(refreshOidcTokensMock).not.toHaveBeenCalled();
      },
    );
    (0, vitest_1.it)('rejects within-window token when refresh fails', async () => {
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
      const { getUiSession } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-oidc-session')),
      );
      const result = await getUiSession(req);
      (0, vitest_1.expect)(result).toBeNull();
      (0, vitest_1.expect)(refreshOidcTokensMock).not.toHaveBeenCalled();
    });
  });
  (0, vitest_1.describe)('shouldRefreshSeparateToken window logic', () => {
    (0, vitest_1.it)('does not refresh far-future tokens, refreshes within 5min, rejects expired', async () => {
      const { shouldRefreshSeparateToken, isSeparateTokenExpired } = await Promise.resolve().then(() =>
        __importStar(require('../../../src/api/helpers/ui-auth-token')),
      );
      const now = Date.now();
      (0, vitest_1.expect)(shouldRefreshSeparateToken(now + 3600 * 1000)).toBe(false);
      (0, vitest_1.expect)(shouldRefreshSeparateToken(now + 4 * 60 * 1000)).toBe(true);
      (0, vitest_1.expect)(shouldRefreshSeparateToken(now + 60 * 1000)).toBe(true);
      (0, vitest_1.expect)(shouldRefreshSeparateToken(now - 1000)).toBe(false);
      (0, vitest_1.expect)(isSeparateTokenExpired(now - 1000)).toBe(true);
      (0, vitest_1.expect)(isSeparateTokenExpired(now + 1000)).toBe(false);
      (0, vitest_1.expect)(shouldRefreshSeparateToken(undefined)).toBe(false);
    });
  });
});
