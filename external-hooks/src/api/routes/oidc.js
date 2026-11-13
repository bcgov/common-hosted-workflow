"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExternalUiErrorRedirect = buildExternalUiErrorRedirect;
exports.buildOidcRouter = buildOidcRouter;
exports.resolveNextRole = resolveNextRole;
const express_1 = require("express");
const oidc_provider_1 = require("../helpers/oidc-provider");
const cookie_1 = require("../helpers/cookie");
const ui_oidc_store_1 = require("../helpers/ui-oidc-store");
const n8n_oidc_1 = require("../helpers/n8n-oidc");
const url_1 = require("../helpers/url");
const return_target_1 = require("../helpers/return-target");
const logger_1 = require("../utils/logger");
const oidc_login_coordinator_1 = require("../services/oidc-login-coordinator");
const log = (0, logger_1.createLogger)('OIDCHook');
// Public error boundary — allowlist of stable public codes/messages.
// Detailed causes are logged server-side; redirects never carry provider
// descriptions, token details, URLs with secrets, or raw infrastructure text.
const ALLOWED_OIDC_PROVIDER_ERROR_CODES = new Set([
    'invalid_request',
    'unauthorized_client',
    'access_denied',
    'unsupported_response_type',
    'invalid_scope',
    'server_error',
    'temporarily_unavailable',
    'interaction_required',
    'login_required',
    'account_selection_required',
    'consent_required',
    'invalid_request_uri',
    'invalid_request_object',
    'request_not_supported',
    'request_uri_not_supported',
    'registration_not_supported',
]);
const STABLE_PUBLIC_ROUTE_MESSAGES = new Set([
    'Missing authorization code or state',
    'Missing state cookies - session expired',
    'Invalid state - possible CSRF attack',
    'Missing or invalid nonce - session expired',
    'OIDC authorization endpoint is not configured',
    'OIDC issuer is required in manual endpoint mode',
    'OIDC issuer is not configured',
    'Authentication failed',
]);
function toPublicRouteMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    if (STABLE_PUBLIC_ROUTE_MESSAGES.has(raw))
        return raw;
    for (const allowed of STABLE_PUBLIC_ROUTE_MESSAGES) {
        if (raw.includes(allowed))
            return allowed;
    }
    // Map issuer-related failures to generic invalid-issuer public code
    if (/OIDC issuer is required/i.test(raw) ||
        /OIDC issuer is not configured/i.test(raw) ||
        /discovery issuer mismatch/i.test(raw)) {
        return 'Authentication failed';
    }
    return 'Authentication failed';
}
function toPublicProviderErrorCode(errorParam) {
    const raw = String(errorParam);
    if (ALLOWED_OIDC_PROVIDER_ERROR_CODES.has(raw))
        return raw;
    return 'Authentication failed';
}
function buildExternalUiErrorRedirect(message) {
    return '/ui?error=' + encodeURIComponent(message);
}
function buildOidcRouter({ n8nRepositories, customRepositories, authService, jwtService, userService, tenantProjectSyncService, tenantService, cstarService, config, }) {
    // Fail fast on invalid security configuration before serving login.
    if (!config.issuerUrl) {
        throw new Error('OIDC issuer is required: set OIDC_ISSUER (manual endpoint mode requires explicit issuer)');
    }
    const router = (0, express_1.Router)();
    const cookieSecret = (0, n8n_oidc_1.getCookieSecret)();
    const returnTargetPolicy = (0, return_target_1.createReturnTargetPolicy)();
    // Capture deployment-derived cookie security once per router (injected config, not per-request env read).
    // Fails closed in production when base URL and protocol disagree.
    const isSecureCookie = (0, cookie_1.getSecureCookieFlag)();
    // Coordinator owns provider completion, token persistence, eligibility, provisioning,
    // role sync, tenant mapping/sync, and session issuance. Route is thin adapter.
    const loginCoordinator = (0, oidc_login_coordinator_1.createOidcLoginCoordinator)({
        config,
        returnTargetPolicy,
        userRepository: n8nRepositories.user,
        projectRepository: n8nRepositories.project,
        tenantProjectRelationRepository: customRepositories.tenantProjectRelation,
        jwtService,
        userService,
        tenantProjectSyncService,
        tenantService,
        cstarService,
    });
    router.get('/login', async (req, res) => {
        const returnTo = (0, return_target_1.resolveReturnTarget)(req.query.returnTo, 'login', returnTargetPolicy);
        const existingToken = req.cookies['n8n-auth'];
        if (existingToken && !returnTo) {
            try {
                const [user] = await authService.resolveJwt(existingToken, req, res);
                if (user) {
                    log.debug('OIDC login: existing n8n session is valid, redirecting to app', { userId: user.id });
                    return res.redirect('/');
                }
            }
            catch (error) {
                log.debug('OIDC login: existing n8n session is invalid, starting OIDC flow', { error: String(error) });
            }
        }
        try {
            const authRequest = await (0, oidc_provider_1.beginOidcAuthorization)({
                config,
                redirectUri: config.redirectUri,
                usePkce: true,
            });
            res.cookie('n8n-oidc-state', (0, n8n_oidc_1.createSignedCookie)({
                state: authRequest.state,
                codeVerifier: authRequest.codeVerifier,
                redirectUri: authRequest.redirectUri,
                returnTo,
            }, cookieSecret), (0, cookie_1.getCookieOptions)(isSecureCookie));
            res.cookie('n8n-oidc-nonce', (0, n8n_oidc_1.createSignedCookie)({ nonce: authRequest.nonce }, cookieSecret), (0, cookie_1.getCookieOptions)(isSecureCookie));
            res.redirect(authRequest.authorizationUrl);
        }
        catch (error) {
            (0, logger_1.logError)(log, error, { context: 'OIDC login' });
            res.redirect(buildExternalUiErrorRedirect(toPublicRouteMessage(error)));
        }
    });
    router.get('/callback', async (_req, res) => {
        try {
            const callbackResult = validateCallbackRequest(_req, cookieSecret);
            if (callbackResult.redirect) {
                return res.redirect(callbackResult.redirect);
            }
            const { code, statePayload, noncePayload } = callbackResult;
            res.clearCookie('n8n-oidc-state');
            res.clearCookie('n8n-oidc-nonce');
            const outcome = await loginCoordinator.handleCallback({ code: code, statePayload, noncePayload });
            if (outcome.kind === 'eligible') {
                // Atomicity: UI exchange already prepared before n8n token; set n8n-auth only on success.
                res.cookie('n8n-auth', outcome.n8nAuthToken, (0, cookie_1.getAuthCookieOptions)(isSecureCookie));
                return res.redirect(outcome.redirectUrl);
            }
            if (outcome.kind === 'access-request') {
                // P0: access-request must never leave a stale n8n-auth in the
                // browser (same-identity eligibility loss or cross-identity switch).
                // The route is the single shared enforcement boundary — coordinator
                // returns the outcome, route terminates any prior n8n session.
                try {
                    authService.clearCookie(res);
                }
                catch {
                    // Fall back to direct clear if AuthService derivation throws in
                    // misconfigured production (getSecureCookieFlag) — still terminate.
                    try {
                        res.clearCookie('n8n-auth', { path: '/' });
                    }
                    catch {
                        // ignore
                    }
                }
                return res.redirect(outcome.redirectUrl);
            }
            return res.redirect(buildExternalUiErrorRedirect(outcome.publicMessage));
        }
        catch (error) {
            (0, logger_1.logError)(log, error, { context: 'OIDC callback' });
            res.redirect(buildExternalUiErrorRedirect('Authentication failed'));
        }
    });
    router.get('/logout', async (req, res) => {
        const requestedReturnTo = (0, return_target_1.resolveReturnTarget)(req.query.returnTo, 'logout', returnTargetPolicy) || '/';
        // UI-originated logout carries a short-lived, single-use opaque handle that
        // binds the verified bearer identity to a validated return target. A
        // consumed (or unknown/expired) handle never authorizes anything.
        const logoutHandle = typeof req.query.logout === 'string' ? req.query.logout : '';
        let handleRecord = null;
        if (logoutHandle) {
            try {
                handleRecord = await (0, ui_oidc_store_1.consumeUiLogoutHandle)(logoutHandle);
                if (!handleRecord) {
                    log.warn('OIDC logout: logout handle is unknown or already used');
                }
            }
            catch (error) {
                (0, logger_1.logError)(log, error, { context: 'OIDC logout handle consumption' });
            }
        }
        // Identity is only ever trusted from the authenticated logout handle or a
        // valid n8n cookie — never from caller-supplied query parameters.
        const boundReturnTo = handleRecord
            ? (0, return_target_1.resolveReturnTarget)(handleRecord.returnTo, 'logout', returnTargetPolicy) || requestedReturnTo
            : requestedReturnTo;
        const returnTo = (0, url_1.appendQueryParam)(boundReturnTo, 'signedOut', '1');
        try {
            let email = handleRecord?.email ?? '';
            const token = req.cookies['n8n-auth'];
            if (token) {
                try {
                    const [user] = await authService.resolveJwt(token, req, res);
                    if (!email) {
                        email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
                    }
                    await authService.invalidateToken(req);
                }
                catch (error) {
                    // An invalid cookie must not fall back to caller-controlled identity.
                    log.debug('OIDC logout: failed to resolve or invalidate n8n session', { error: String(error) });
                }
            }
            authService.clearCookie(res);
            if (!email) {
                log.debug('OIDC logout: no authenticated identity, redirecting without touching token records', {
                    returnTo,
                });
                res.redirect(returnTo);
                return;
            }
            // Local session cleanup happens before any upstream work so provider
            // discovery or network failure cannot prevent revocation.
            const idToken = await (0, ui_oidc_store_1.getUiOidcIdToken)(email);
            await (0, ui_oidc_store_1.deleteUiOidcTokens)(email);
            if (!idToken) {
                log.debug('OIDC logout: no ID token stored, redirecting directly', { email, returnTo });
                res.redirect(returnTo);
                return;
            }
            const discovery = await (0, oidc_provider_1.fetchOidcDiscoveryDocument)(config);
            const endSessionEndpoint = discovery.end_session_endpoint || config.endSessionEndpoint;
            if (!endSessionEndpoint) {
                log.debug('OIDC logout: no end_session_endpoint in discovery or config, redirecting directly', {
                    email,
                    returnTo,
                });
                res.redirect(returnTo);
                return;
            }
            log.info('OIDC logout: redirecting to upstream IDP end_session_endpoint', { email, returnTo });
            const logoutUrl = new URL(endSessionEndpoint);
            logoutUrl.searchParams.set('post_logout_redirect_uri', returnTo);
            logoutUrl.searchParams.set('id_token_hint', idToken);
            res.redirect(logoutUrl.toString());
        }
        catch (error) {
            (0, logger_1.logError)(log, error, { context: 'OIDC logout' });
            res.redirect(returnTo);
        }
    });
    return router;
}
/**
 * Coordinator owns eligibility/role resolution. This export is a
 * backwards-compatible delegate — one implementation (`resolveNextRoleInternal`)
 * owns the decision. Kept for existing tests/routes that import from this module.
 */
async function resolveNextRole(params) {
    return (0, oidc_login_coordinator_1.resolveNextRoleInternal)(params);
}
function validateCallbackRequest(req, cookieSecret) {
    const { code, state, error, error_description } = req.query;
    if (error) {
        // Log detailed provider error server-side; never reflect error_description verbatim (may contain hostile text/secrets).
        log.error('OIDC error from provider', { error, errorDescription: error_description });
        const publicCode = toPublicProviderErrorCode(error);
        return {
            redirect: buildExternalUiErrorRedirect(publicCode),
            code: null,
            statePayload: null,
            noncePayload: null,
        };
    }
    if (!code || !state) {
        return {
            redirect: buildExternalUiErrorRedirect('Missing authorization code or state'),
            code: null,
            statePayload: null,
            noncePayload: null,
        };
    }
    const stateCookie = req.cookies['n8n-oidc-state'];
    const nonceCookie = req.cookies['n8n-oidc-nonce'];
    if (!stateCookie || !nonceCookie) {
        return {
            redirect: buildExternalUiErrorRedirect('Missing state cookies - session expired'),
            code: null,
            statePayload: null,
            noncePayload: null,
        };
    }
    const statePayload = (0, n8n_oidc_1.verifySignedCookie)(stateCookie, cookieSecret);
    const noncePayload = (0, n8n_oidc_1.verifySignedCookie)(nonceCookie, cookieSecret);
    if (!statePayload || statePayload.state !== state) {
        return {
            redirect: buildExternalUiErrorRedirect('Invalid state - possible CSRF attack'),
            code: null,
            statePayload: null,
            noncePayload: null,
        };
    }
    if (!noncePayload || typeof noncePayload.nonce !== 'string' || !noncePayload.nonce) {
        return {
            redirect: buildExternalUiErrorRedirect('Missing or invalid nonce - session expired'),
            code: null,
            statePayload: null,
            noncePayload: null,
        };
    }
    return { redirect: null, code: code, statePayload, noncePayload };
}
