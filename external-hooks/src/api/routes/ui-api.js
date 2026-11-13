'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createUiRequestContextMiddleware = createUiRequestContextMiddleware;
exports.requireUiRequestContextMiddleware = requireUiRequestContextMiddleware;
exports.resolveUiRequestContext = resolveUiRequestContext;
exports.buildUiApiRouter = buildUiApiRouter;
const crypto_1 = require('crypto');
const express_1 = require('express');
const _config_1 = require('@config');
const responses_1 = require('./responses');
const validation_1 = require('../utils/validation');
const ui_1 = require('../schemas/ui');
const access_request_1 = require('../schemas/access-request');
const ui_oidc_store_1 = require('../helpers/ui-oidc-store');
const ui_oidc_session_1 = require('../helpers/ui-oidc-session');
const ui_oidc_store_2 = require('../helpers/ui-oidc-store');
const cookie_1 = require('../helpers/cookie');
const permissions_1 = require('../helpers/permissions');
const ui_oidc_1 = require('../helpers/ui-oidc');
const url_1 = require('../helpers/url');
const return_target_1 = require('../helpers/return-target');
const middlewares_1 = require('../middlewares');
const wil_1 = require('./wil');
const admin_projects_1 = require('./admin-projects');
const projects_1 = require('./projects');
const cstar_sso_user_id_1 = require('../helpers/cstar-sso-user-id');
function setRefreshedUiTokenHeader(res, token) {
  if (token) {
    res.setHeader('X-UI-Auth-Token', token);
  }
}
function clearN8nAuthCookie(res) {
  const clearCookie = res.clearCookie;
  if (typeof clearCookie !== 'function') return;
  try {
    const isSecure = (0, cookie_1.getSecureCookieFlag)();
    clearCookie.call(res, 'n8n-auth', {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
    });
  } catch {
    // getSecureCookieFlag throws in production on misconfigured
    // N8N_BASE_URL/N8N_PROTOCOL — fall back to path-only clear so
    // an expired OIDC session still removes the browser cookie.
    try {
      clearCookie.call(res, 'n8n-auth', { path: '/' });
    } catch {
      // ignore
    }
  }
}
function extendN8nAuthCookie(req, res) {
  const cookies = req.cookies;
  const token = cookies?.['n8n-auth'];
  if (!token) return;
  const cookieFn = res.cookie;
  if (typeof cookieFn !== 'function') return;
  try {
    const isSecure = (0, cookie_1.getSecureCookieFlag)();
    cookieFn.call(res, 'n8n-auth', token, (0, cookie_1.getAuthCookieOptions)(isSecure));
  } catch {
    // misconfigured Secure derivation must not break refresh
  }
}
function shouldClearN8nCookieOnExpiry(req, resolved) {
  // OIDC session expired/revoked but the browser still presents
  // n8n-auth — remove it so both sessions end together.
  // Only when a UI bearer was presented; anonymous without a bearer
  // must not clear a valid n8n-only session.
  return !resolved && !!(0, ui_oidc_session_1.getBearerToken)(req);
}
async function resolveUiRequestContext(req, services, injected) {
  const getSession = injected?.getUiSessionFn ?? ui_oidc_session_1.getUiSession;
  const getAccessByEmail = injected?.getAccessTokenByEmailFn ?? ui_oidc_store_2.getUiOidcAccessTokenByEmail;
  const rawSessionResult = injected?.sessionStoreDeps
    ? await getSession(req, injected.sessionStoreDeps)
    : await getSession(req);
  if (!rawSessionResult) {
    return null;
  }
  const hasWrappedSession =
    typeof rawSessionResult === 'object' && rawSessionResult !== null && 'session' in rawSessionResult;
  const session = hasWrappedSession ? rawSessionResult.session : rawSessionResult;
  const sessionRefreshedToken = hasWrappedSession ? rawSessionResult.refreshedToken : undefined;
  // Upstream credential is distinct from the UI bearer. In separate-token mode the bearer
  // is an app JWT (HS256, sid-checked) while the upstream OIDC access token lives server-side.
  // Track the authoritative upstream token (refreshed within this request if needed).
  let upstreamAccessToken = hasWrappedSession ? rawSessionResult.upstreamAccessToken : undefined;
  const context = await services.uiApi.loadUserContext(session.email);
  const ssoUserId = (0, cstar_sso_user_id_1.resolveCstarSsoUserId)(session.claims, session.subject, session.email);
  // Unauthenticated-by-n8n identities keep `n8nUser: null`; they hold a UI session
  // with access-request capabilities only, never a synthetic enabled n8n user.
  const resolvedN8nUser = (0, ui_oidc_session_1.serializeN8nUser)(context.n8nUser);
  const refreshAccessToken = async () => {
    const result = injected?.sessionStoreDeps
      ? await ui_oidc_session_1.refreshSessionByEmail(session.email, undefined, injected.sessionStoreDeps)
      : await (0, ui_oidc_session_1.refreshSessionByEmail)(session.email);
    if (!result) return null;
    if (!result.upstreamAccessToken) return null;
    upstreamAccessToken = result.upstreamAccessToken;
    return { accessToken: result.upstreamAccessToken, refreshedToken: result.refreshedToken };
  };
  const tenantRolesResult = await services.tenant.getTenantRolesForSession({
    email: session.email,
    ssoUserId,
    refreshAccessToken,
  });
  const tenantGroupsResult = await services.tenant.getTenantGroupsForSession({
    email: session.email,
    ssoUserId,
    refreshAccessToken,
  });
  const refreshedToken = tenantRolesResult.refreshedToken ?? tenantGroupsResult.refreshedToken ?? sessionRefreshedToken;
  // Fallback to server-side store for the authoritative upstream credential (never the UI bearer).
  // If refresh occurred via getUiSession or tenant refreshAccessToken, upstreamAccessToken already holds the fresh value.
  if (!upstreamAccessToken) {
    const access = await getAccessByEmail(session.email);
    upstreamAccessToken = access ?? undefined;
  }
  return {
    session: {
      ...session,
      n8nUser: resolvedN8nUser,
      permissions: (0, permissions_1.computePermissions)(resolvedN8nUser, services.featureFlag),
      tenantRoles: tenantRolesResult.roles,
      tenantGroups: tenantGroupsResult.groups,
      // Internal use only — excluded from buildSessionSummary/buildWhoamiResponse public types
      upstreamAccessToken,
    },
    context,
    refreshedToken,
    upstreamAccessToken,
  };
}
function createUiRequestContextMiddleware(services, injected) {
  return async (req, _res, next) => {
    try {
      const resolved = await resolveUiRequestContext(req, services, injected);
      if (resolved) {
        req.session = resolved.session;
        req.context = resolved.context;
        setRefreshedUiTokenHeader(_res, resolved.refreshedToken);
        if (resolved.refreshedToken) {
          extendN8nAuthCookie(req, _res);
        }
      } else if (shouldClearN8nCookieOnExpiry(req, resolved)) {
        clearN8nAuthCookie(_res);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
function requireUiRequestContextMiddleware(services, injected) {
  const loadUiRequestContext = createUiRequestContextMiddleware(services, injected);
  return async (req, res, next) => {
    await loadUiRequestContext(req, res, (error) => {
      if (error) {
        throw error;
      }
    });
    if (!req.session || !req.context) {
      (0, responses_1.UnauthorizedResponse)(res);
      return;
    }
    next();
  };
}
function checkPermission(permissionKey) {
  return (req, res, next) => {
    const hasPermission = req.session?.permissions?.[permissionKey];
    if (!hasPermission) {
      (0, responses_1.ForbiddenResponse)(res);
      return;
    }
    next();
  };
}
function checkRole(...allowedRoles) {
  return (req, res, next) => {
    const n8nUser = req.session?.n8nUser;
    // Disabled users must not pass role guards even when a stale role remains in the database.
    if (!n8nUser || n8nUser.disabled || !n8nUser.role || !allowedRoles.includes(n8nUser.role.slug)) {
      (0, responses_1.ForbiddenResponse)(res);
      return;
    }
    next();
  };
}
function buildUiApiRouter(routeContext) {
  const { services } = routeContext;
  const router = (0, express_1.Router)();
  const requireUiRequestContext = requireUiRequestContextMiddleware(services);
  const returnTargetPolicy = (0, return_target_1.createReturnTargetPolicy)();
  router.get('/session', async (req, res) => {
    const resolved = await resolveUiRequestContext(req, services);
    if (resolved?.refreshedToken) {
      extendN8nAuthCookie(req, res);
    } else if (shouldClearN8nCookieOnExpiry(req, resolved)) {
      clearN8nAuthCookie(res);
    }
    setRefreshedUiTokenHeader(res, resolved?.refreshedToken);
    res.json((0, ui_oidc_1.buildSessionSummary)(resolved?.session ?? null));
  });
  // Deprecated compatibility alias — redirects only, never establishes a session
  // or trusts identity. The sole authorization flow is GET /rest/auth/oidc/callback.
  // Retained as a redirect alias for deployed callers; removal target: next minor
  // after provider docs confirm only the unified callback is registered (expected 2026-09-30).
  router.get('/auth/login', async (req, res) => {
    const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/ui/';
    res.redirect((0, url_1.appendQueryParam)(`${_config_1.N8N_BASE_URL}/rest/auth/oidc/login`, 'returnTo', returnTo));
  });
  router.post('/auth/exchange', (0, validation_1.createRequestParser)(ui_1.authExchangeSchema), async (req, res) => {
    const exchange = await (0, ui_oidc_store_1.consumeUiSessionExchange)(req.parsed.body.session);
    if (!exchange) {
      (0, responses_1.UnauthorizedResponse)(res);
      return;
    }
    (0, responses_1.OkResponse)(res, { token: exchange.token }, ui_1.authExchangeResponseSchema);
  });
  const UI_LOGOUT_HANDLE_TTL_MS = 60 * 1000;
  // Authenticated logout preparation: derive identity from the verified bearer
  // session and return a short-lived, single-use opaque logout handle bound to
  // the validated return target. The canonical OIDC logout endpoint consumes
  // the handle and never trusts caller-supplied identity or destinations.
  router.post(
    '/auth/logout-prepare',
    (0, validation_1.createRequestParser)(ui_1.authLogoutPrepareSchema),
    async (req, res) => {
      const sessionResult = await (0, ui_oidc_session_1.getUiSession)(req);
      const session = sessionResult && 'session' in sessionResult ? sessionResult.session : null;
      if (!session?.email) {
        (0, responses_1.UnauthorizedResponse)(res);
        return;
      }
      const returnTo =
        (0, return_target_1.resolveReturnTarget)(req.parsed.body?.returnTo, 'logout', returnTargetPolicy) ??
        returnTargetPolicy.fallback;
      const handle = (0, crypto_1.randomBytes)(24).toString('base64url');
      await (0, ui_oidc_store_1.setUiLogoutHandle)(handle, { email: session.email, returnTo }, UI_LOGOUT_HANDLE_TTL_MS);
      (0, responses_1.OkResponse)(
        res,
        { logoutUrl: (0, url_1.appendQueryParam)(`${_config_1.N8N_BASE_URL}/rest/auth/oidc/logout`, 'logout', handle) },
        ui_1.authLogoutPrepareResponseSchema,
      );
    },
  );
  // Deprecated compatibility alias — redirect only, never establishes a session
  // or trusts identity. Canonical logout is GET /rest/auth/oidc/logout which
  // derives identity from the n8n cookie or a bearer-authenticated logout handle.
  // This alias forwards only the return target and is retained for compatibility;
  // removal target: next minor after callers migrate (expected 2026-09-30).
  router.get('/auth/logout', async (req, res) => {
    const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/ui/';
    res.redirect((0, url_1.appendQueryParam)(`${_config_1.N8N_BASE_URL}/rest/auth/oidc/logout`, 'returnTo', returnTo));
  });
  router.get('/whoami', requireUiRequestContext, async (req, res) => {
    const { session } = req;
    (0, responses_1.OkResponse)(res, (0, ui_oidc_1.buildWhoamiResponse)(session, req.get('user-agent')));
  });
  router.get('/workflows', requireUiRequestContext, checkPermission('canViewWorkflows'), async (req, res) => {
    const { context } = req;
    (0, responses_1.OkResponse)(res, context.workflows);
  });
  router.post(
    '/workflows/:workflowId/share',
    requireUiRequestContext,
    checkPermission('canShareWorkflows'),
    (0, validation_1.createRequestParser)(ui_1.shareWorkflowSchema),
    async (req, res) => {
      const result = await services.uiApi.shareWorkflow(
        req.session.email,
        req.parsed.params.workflowId,
        req.parsed.body.email,
      );
      (0, responses_1.CreatedResponse)(
        res,
        {
          workflowId: result.workflowId,
          sharedWithEmail: result.sharedWithEmail,
        },
        ui_1.shareWorkflowResponseSchema,
      );
    },
  );
  router.delete(
    '/workflows/:workflowId/projects/:projectId',
    requireUiRequestContext,
    checkPermission('canUnshareWorkflows'),
    (0, validation_1.createRequestParser)(ui_1.unshareWorkflowSchema),
    async (req, res) => {
      const result = await services.uiApi.unshareWorkflow(
        req.session.email,
        req.parsed.params.workflowId,
        req.parsed.params.projectId,
      );
      (0, responses_1.OkResponse)(
        res,
        {
          workflowId: result.workflowId,
          projectId: result.projectId,
        },
        ui_1.unshareWorkflowResponseSchema,
      );
    },
  );
  router.post(
    '/access-requests',
    requireUiRequestContext,
    checkPermission('canRequestAccess'),
    (0, validation_1.createRequestParser)(access_request_1.createAccessRequestSchema),
    async (req, res) => {
      const accessRequest = await services.accessRequest.createAccessRequest({
        requesterEmail: req.session.email,
        justification: req.parsed.body.justification,
      });
      (0, responses_1.CreatedResponse)(
        res,
        {
          accessRequest,
        },
        access_request_1.createAccessRequestResponseSchema,
      );
    },
  );
  router.get('/access-requests/my', requireUiRequestContext, async (req, res) => {
    const session = req.session;
    const accessRequest = await services.accessRequest.getMyAccessRequest(session.email);
    (0, responses_1.OkResponse)(
      res,
      {
        accessRequest,
      },
      access_request_1.getMyAccessRequestResponseSchema,
    );
  });
  router.get(
    '/access-requests',
    requireUiRequestContext,
    checkRole('global:owner', 'global:admin'),
    (0, validation_1.createRequestParser)(access_request_1.listAccessRequestsSchema),
    async (req, res) => {
      const { status, search, limit, offset } = req.parsed.query ?? {};
      const result = await services.accessRequest.listAccessRequests({
        status,
        search,
        limit: limit ?? 50,
        offset: offset ?? 0,
      });
      (0, responses_1.OkResponse)(res, result, access_request_1.accessRequestListResponseSchema);
    },
  );
  router.post(
    '/access-requests/:id/review',
    requireUiRequestContext,
    checkRole('global:owner', 'global:admin'),
    (0, validation_1.createRequestParser)(access_request_1.reviewAccessRequestSchema),
    async (req, res) => {
      const result = await services.accessRequest.reviewAccessRequest({
        accessRequestId: req.parsed.params.id,
        action: req.parsed.body.action,
        reviewerEmail: req.session.email,
        reviewerN8nUserId: req.session.n8nUser?.id ?? '',
        denyReason: req.parsed.body.denyReason,
      });
      (0, responses_1.OkResponse)(
        res,
        {
          accessRequest: result,
        },
        access_request_1.reviewAccessRequestResponseSchema,
      );
    },
  );
  // Mount shared project read sub-router (UI session auth + canManageProject).
  // Admins see all n8n projects; members see only the projects they can access.
  router.use(
    '/projects',
    requireUiRequestContext,
    checkPermission('canManageProject'),
    (0, projects_1.buildProjectsRouter)(routeContext),
  );
  // Mount admin project-tenant sub-router (UI session auth + admin role + canManageProject)
  router.use(
    '/admin',
    requireUiRequestContext,
    checkPermission('canManageProject'),
    checkRole('global:owner', 'global:admin'),
    (0, admin_projects_1.buildAdminProjectRouter)(routeContext),
  );
  // Mount WIL sub-router (protected by requireUiRequestContext + canManageWil; writes are refused in read-only mode)
  router.use(
    '/wil',
    requireUiRequestContext,
    checkPermission('canManageWil'),
    (0, middlewares_1.createReadOnlyMiddleware)(),
    (0, wil_1.buildWilRouter)(routeContext),
  );
  return router;
}
