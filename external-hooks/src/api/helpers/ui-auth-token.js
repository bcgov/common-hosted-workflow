"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UI_AUTH_REFRESH_WINDOW_MS = void 0;
exports.resolveAccessTokenExpiresAt = resolveAccessTokenExpiresAt;
exports.shouldRefreshAccessToken = shouldRefreshAccessToken;
exports.shouldRefreshSeparateToken = shouldRefreshSeparateToken;
exports.isSeparateTokenExpired = isSeparateTokenExpired;
exports.isRefreshTokenExpired = isRefreshTokenExpired;
exports.createUiAuthToken = createUiAuthToken;
exports.issueUiSessionToken = issueUiSessionToken;
const crypto_1 = require("crypto");
const jose_1 = require("jose");
const _config_1 = require("@config");
const UI_AUTH_JWT_TTL_MS = 8 * 60 * 60 * 1000;
function resolveAccessTokenExpiresAt(expiresInSeconds) {
    return typeof expiresInSeconds === 'number' ? Date.now() + expiresInSeconds * 1000 : undefined;
}
function shouldRefreshAccessToken(expiresAt) {
    return typeof expiresAt === 'number' && Date.now() >= expiresAt;
}
exports.UI_AUTH_REFRESH_WINDOW_MS = 5 * 60 * 1000;
function shouldRefreshSeparateToken(expiresAt) {
    if (typeof expiresAt !== 'number')
        return false;
    const now = Date.now();
    if (expiresAt <= now)
        return false;
    return expiresAt - now <= exports.UI_AUTH_REFRESH_WINDOW_MS;
}
function isSeparateTokenExpired(expiresAt) {
    if (typeof expiresAt !== 'number')
        return false;
    return Date.now() >= expiresAt;
}
function isRefreshTokenExpired(expiresAt) {
    if (typeof expiresAt !== 'number')
        return false;
    return Date.now() > expiresAt;
}
async function createUiAuthToken(params) {
    if (!_config_1.UI_AUTH_JWT_SECRET) {
        throw new Error('UI auth JWT secret is not configured');
    }
    const now = Math.floor(Date.now() / 1000);
    const maxExpiresAt = now + Math.floor(UI_AUTH_JWT_TTL_MS / 1000);
    const upstreamExpiresAt = params.upstreamExpiresAt ? Math.floor(params.upstreamExpiresAt / 1000) : undefined;
    const expiresAt = upstreamExpiresAt ? Math.min(maxExpiresAt, upstreamExpiresAt) : maxExpiresAt;
    if (expiresAt <= now) {
        throw new Error('Upstream token is already expired');
    }
    return new jose_1.SignJWT({
        email: params.oidc.email,
        preferredUsername: params.oidc.preferredUsername,
        name: params.oidc.name,
        ...(params.sessionId ? { sid: params.sessionId } : {}),
        oidc: {
            ...params.oidc,
            claims: params.oidc.claims,
        },
    })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(_config_1.UI_AUTH_JWT_ISSUER)
        .setAudience(_config_1.UI_AUTH_JWT_AUDIENCE)
        .setSubject(params.oidc.subject)
        .setIssuedAt(now)
        .setExpirationTime(expiresAt)
        .sign((0, crypto_1.createSecretKey)(Buffer.from(_config_1.UI_AUTH_JWT_SECRET)));
}
async function issueUiSessionToken(params) {
    if (_config_1.UI_AUTH_USE_SEPARATE_TOKEN) {
        if (!params.sessionId) {
            // Separate JWTs must carry the per-session identifier so logout can
            // revoke them server-side.
            throw new Error('UI session id is required for separate-token sessions');
        }
        return await createUiAuthToken({
            oidc: params.oidc,
            upstreamExpiresAt: params.upstreamExpiresAt,
            sessionId: params.sessionId,
        });
    }
    if (!params.upstreamAccessToken) {
        throw new Error('OIDC provider did not return an access token');
    }
    return params.upstreamAccessToken;
}
