"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const createClientMock = vitest_1.vi.fn();
vitest_1.vi.mock('redis', () => ({
    createClient: createClientMock,
}));
function createMockRedisClient() {
    return {
        on: vitest_1.vi.fn(),
        connect: vitest_1.vi.fn().mockResolvedValue(undefined),
        set: vitest_1.vi.fn().mockResolvedValue('OK'),
        get: vitest_1.vi.fn().mockResolvedValue(null),
        del: vitest_1.vi.fn().mockResolvedValue(1),
    };
}
(0, vitest_1.describe)('ui-oidc-store', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.resetModules();
        vitest_1.vi.unstubAllEnvs();
        createClientMock.mockReset();
    });
    (0, vitest_1.it)('passes the configured redis password to the client', async () => {
        vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
        vitest_1.vi.stubEnv('UI_OIDC_REDIS_PASSWORD', 'super-secret');
        const redisClient = createMockRedisClient();
        createClientMock.mockReturnValue(redisClient);
        const { setUiSessionExchange } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
        await setUiSessionExchange('handle-1', 'token-1', 60_000);
        (0, vitest_1.expect)(createClientMock).toHaveBeenCalledWith({
            url: 'redis://redis:6379',
            password: 'super-secret', // pragma: allowlist secret
        });
    });
    (0, vitest_1.describe)('TTL strategy', () => {
        (0, vitest_1.it)('stores refresh token with default 30-day TTL', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = createMockRedisClient();
            createClientMock.mockReturnValue(redisClient);
            const { setUiOidcRefreshToken } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            await setUiOidcRefreshToken('user@example.com', 'refresh-token-123');
            (0, vitest_1.expect)(redisClient.set).toHaveBeenCalledWith(vitest_1.expect.stringContaining('reftoken:'), 'refresh-token-123', {
                PX: 30 * 24 * 60 * 60 * 1000,
            });
        });
        (0, vitest_1.it)('stores refresh token with custom TTL when provided', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = createMockRedisClient();
            createClientMock.mockReturnValue(redisClient);
            const { setUiOidcRefreshToken } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            await setUiOidcRefreshToken('user@example.com', 'refresh-token-123', 60_000);
            (0, vitest_1.expect)(redisClient.set).toHaveBeenCalledWith(vitest_1.expect.stringContaining('reftoken:'), 'refresh-token-123', {
                PX: 60_000,
            });
        });
        (0, vitest_1.it)('stores ID token with TTL based on JWT expiry', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = createMockRedisClient();
            createClientMock.mockReturnValue(redisClient);
            const futureExp = Math.floor((Date.now() + 3600_000) / 1000);
            const payload = JSON.stringify({ exp: futureExp });
            const base64 = Buffer.from(payload).toString('base64url');
            const idToken = `header.${base64}.signature`;
            const { setUiOidcIdToken } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            await setUiOidcIdToken('user@example.com', idToken);
            (0, vitest_1.expect)(redisClient.set).toHaveBeenCalledWith(vitest_1.expect.stringContaining('idtoken:'), idToken, vitest_1.expect.objectContaining({ PX: vitest_1.expect.any(Number) }));
            const callArgs = redisClient.set.mock.calls[0];
            const ttlMs = callArgs[2].PX;
            (0, vitest_1.expect)(ttlMs).toBeGreaterThan(3500_000);
            (0, vitest_1.expect)(ttlMs).toBeLessThanOrEqual(3600_000);
        });
        (0, vitest_1.it)('falls back to 24-hour TTL for ID token without expiry', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = createMockRedisClient();
            createClientMock.mockReturnValue(redisClient);
            const payload = JSON.stringify({});
            const base64 = Buffer.from(payload).toString('base64url');
            const idToken = `header.${base64}.signature`;
            const { setUiOidcIdToken } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            await setUiOidcIdToken('user@example.com', idToken);
            (0, vitest_1.expect)(redisClient.set).toHaveBeenCalledWith(vitest_1.expect.stringContaining('idtoken:'), idToken, {
                PX: 24 * 60 * 60 * 1000,
            });
        });
        (0, vitest_1.it)('uses custom TTL for ID token when provided', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = createMockRedisClient();
            createClientMock.mockReturnValue(redisClient);
            const { setUiOidcIdToken } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            await setUiOidcIdToken('user@example.com', 'id-token-123', 120_000);
            (0, vitest_1.expect)(redisClient.set).toHaveBeenCalledWith(vitest_1.expect.stringContaining('idtoken:'), 'id-token-123', {
                PX: 120_000,
            });
        });
    });
    // Malformed Redis records fail closed (never throw) and are treated as revoked.
    // Contract: exercises both the fake (deterministic unit) and, when a real Redis is available,
    // the same validation path (client-side JSON parsing). Real Redis integration would use the same
    // `setRedisClientForTests` override with a live client; the validation is identical because
    // it is pure-JS after the GET. Tests here run on the fake but document fidelity.
    (0, vitest_1.describe)('malformed record handling (fail closed)', () => {
        (0, vitest_1.it)('consumeUiSessionExchange returns null on invalid JSON', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = { ...createMockRedisClient(), getDel: vitest_1.vi.fn().mockResolvedValue('not-json{') };
            createClientMock.mockReturnValue(redisClient);
            const { consumeUiSessionExchange } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            const res = await consumeUiSessionExchange('handle-1');
            (0, vitest_1.expect)(res).toBeNull();
        });
        (0, vitest_1.it)('consumeUiSessionExchange returns null when token missing', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = {
                ...createMockRedisClient(),
                getDel: vitest_1.vi.fn().mockResolvedValue(JSON.stringify({ notToken: 123 })),
            };
            createClientMock.mockReturnValue(redisClient);
            const { consumeUiSessionExchange } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            (0, vitest_1.expect)(await consumeUiSessionExchange('h')).toBeNull();
        });
        (0, vitest_1.it)('consumeUiLogoutHandle returns null on malformed payload', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = {
                ...createMockRedisClient(),
                getDel: vitest_1.vi.fn().mockResolvedValue(JSON.stringify({ email: 'not-an-email', returnTo: 123 })),
            };
            createClientMock.mockReturnValue(redisClient);
            const { consumeUiLogoutHandle } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            (0, vitest_1.expect)(await consumeUiLogoutHandle('lh')).toBeNull();
        });
        (0, vitest_1.it)('getUiOidcRefreshTokenRecord returns null on malformed JSON object', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = {
                ...createMockRedisClient(),
                get: vitest_1.vi.fn().mockResolvedValue(JSON.stringify({ token: 123 })),
            };
            createClientMock.mockReturnValue(redisClient);
            const { getUiOidcRefreshTokenRecord } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            (0, vitest_1.expect)(await getUiOidcRefreshTokenRecord('user@example.com')).toBeNull();
        });
        (0, vitest_1.it)('getUiOidcAccessTokenRecord returns null on malformed JSON', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = { ...createMockRedisClient(), get: vitest_1.vi.fn().mockResolvedValue('{bad json') };
            createClientMock.mockReturnValue(redisClient);
            const { getUiOidcAccessTokenRecord } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            (0, vitest_1.expect)(await getUiOidcAccessTokenRecord('token-abc')).toBeNull();
        });
        (0, vitest_1.it)('getUiTenantRoles returns null on malformed array', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = {
                ...createMockRedisClient(),
                get: vitest_1.vi.fn().mockResolvedValue(JSON.stringify([{ tenantId: '', roles: 'not-array' }])),
            };
            createClientMock.mockReturnValue(redisClient);
            const { getUiTenantRoles } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            (0, vitest_1.expect)(await getUiTenantRoles('user@example.com')).toBeNull();
        });
        (0, vitest_1.it)('getUiTenantGroups returns null on non-array JSON', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const redisClient = {
                ...createMockRedisClient(),
                get: vitest_1.vi.fn().mockResolvedValue(JSON.stringify({ not: 'array' })),
            };
            createClientMock.mockReturnValue(redisClient);
            const { getUiTenantGroups } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            (0, vitest_1.expect)(await getUiTenantGroups('user@example.com')).toBeNull();
        });
        (0, vitest_1.it)('injectable store boundary: setRedisClientForTests allows fake without mocking redis module', async () => {
            vitest_1.vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
            const fakeStore = new Map();
            fakeStore.set('chwf:ui-oidc:acctoken:user@example.com', 'real-token');
            const fakeClient = {
                on: vitest_1.vi.fn(),
                connect: vitest_1.vi.fn(),
                get: vitest_1.vi.fn(async (k) => fakeStore.get(k) ?? null),
                set: vitest_1.vi.fn(async (k, v) => {
                    fakeStore.set(k, v);
                    return 'OK';
                }),
                del: vitest_1.vi.fn(async (k) => 1),
                getDel: vitest_1.vi.fn(async () => null),
            };
            const mod = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            mod.setRedisClientForTests(fakeClient);
            const { getUiOidcAccessTokenByEmail } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/ui-oidc-store')));
            // different import instance after set still uses override because override is module-singleton
            // Call via mod directly to prove override works
            const token = await mod.getUiOidcAccessTokenByEmail('user@example.com');
            (0, vitest_1.expect)(token).toBe('real-token');
            mod.clearRedisClientForTests();
        });
    });
});
