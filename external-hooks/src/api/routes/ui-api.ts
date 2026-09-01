import { randomBytes } from 'crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { type infer as zInfer } from 'zod';
import { N8N_BASE_URL } from '@config';
import { OkResponse, CreatedResponse, ForbiddenResponse, UnauthorizedResponse } from './responses';
import type { ApiRouteContext } from '../types/routes';
import { createRequestParser } from '../utils/validation';
import {
  authExchangeResponseSchema,
  authExchangeSchema,
  authLogoutPrepareResponseSchema,
  authLogoutPrepareSchema,
  shareWorkflowResponseSchema,
  shareWorkflowSchema,
  unshareWorkflowResponseSchema,
  unshareWorkflowSchema,
} from '../schemas/ui';
import {
  createAccessRequestSchema,
  createAccessRequestResponseSchema,
  getMyAccessRequestResponseSchema,
  listAccessRequestsSchema,
  reviewAccessRequestSchema,
  accessRequestListResponseSchema,
  reviewAccessRequestResponseSchema,
} from '../schemas/access-request';
import { consumeUiSessionExchange, setUiLogoutHandle } from '../helpers/ui-oidc-store';
import {
  getBearerToken,
  getUiSession,
  serializeN8nUser,
  refreshSessionByEmail,
  type UiOidcSessionStoreDeps,
} from '../helpers/ui-oidc-session';
import { getUiOidcAccessTokenByEmail } from '../helpers/ui-oidc-store';
import { getAuthCookieOptions, getSecureCookieFlag } from '../helpers/cookie';
import { computePermissions, type Permissions } from '../helpers/permissions';
import { buildSessionSummary, buildWhoamiResponse, type UiSerializedN8nUser } from '../helpers/ui-oidc';
import { appendQueryParam } from '../helpers/url';
import { createReturnTargetPolicy, resolveReturnTarget } from '../helpers/return-target';
import type { UiApiRequest, UiApiTypedRequest } from '../types/ui-api';
import { buildWilRouter } from './wil';
import { buildAdminProjectRouter } from './admin-projects';
import { resolveCstarSsoUserId } from '../helpers/cstar-sso-user-id';

type UiApiMutableRequest = Request & {
  session?: UiApiRequest['session'];
  context?: UiApiRequest['context'];
};

function setRefreshedUiTokenHeader(res: Response, token?: string) {
  if (token) {
    res.setHeader('X-UI-Auth-Token', token);
  }
}

function clearN8nAuthCookie(res: Response) {
  const clearCookie = (res as unknown as { clearCookie?: (name: string, opts?: unknown) => void }).clearCookie;
  if (typeof clearCookie !== 'function') return;
  try {
    const isSecure = getSecureCookieFlag();
    clearCookie.call(res as unknown as Record<string, unknown>, 'n8n-auth', {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax' as const,
      path: '/' as const,
    });
  } catch {
    // getSecureCookieFlag throws in production on misconfigured
    // N8N_BASE_URL/N8N_PROTOCOL — fall back to path-only clear so
    // an expired OIDC session still removes the browser cookie.
    try {
      clearCookie.call(res as unknown as Record<string, unknown>, 'n8n-auth', { path: '/' });
    } catch {
      // ignore
    }
  }
}

function extendN8nAuthCookie(req: Request, res: Response) {
  const cookies = (req as unknown as { cookies?: Record<string, string | undefined> }).cookies;
  const token = cookies?.['n8n-auth'];
  if (!token) return;
  const cookieFn = (res as unknown as { cookie?: (name: string, val: string, opts?: unknown) => void }).cookie;
  if (typeof cookieFn !== 'function') return;
  try {
    const isSecure = getSecureCookieFlag();
    cookieFn.call(res as unknown as Record<string, unknown>, 'n8n-auth', token, getAuthCookieOptions(isSecure));
  } catch {
    // misconfigured Secure derivation must not break refresh
  }
}

function shouldClearN8nCookieOnExpiry(req: Request, resolved: unknown) {
  // OIDC session expired/revoked but the browser still presents
  // n8n-auth — remove it so both sessions end together.
  // Only when a UI bearer was presented; anonymous without a bearer
  // must not clear a valid n8n-only session.
  return !resolved && !!getBearerToken(req);
}

// AUTH-07: Authenticated context — explicit UI credential (bearer via getUiSession),
// upstream credential (server-side, never bearer in separate-token mode),
// identity (session.email/subject/claims), and authorization (permissions/n8nUser).
// Routes consume capabilities (checkPermission/checkRole) rather than inferring
// from token shape. Smallest injectable boundary for tests: optional sessionDeps
// allows faking the store without module-global Redis/env mutation.
export type UiRequestContextDeps = {
  sessionStoreDeps?: UiOidcSessionStoreDeps;
  getUiSessionFn?: typeof getUiSession;
  getAccessTokenByEmailFn?: typeof getUiOidcAccessTokenByEmail;
};
async function resolveUiRequestContext(
  req: Request,
  services: ApiRouteContext['services'],
  injected?: UiRequestContextDeps,
) {
  const getSession = injected?.getUiSessionFn ?? getUiSession;
  const getAccessByEmail = injected?.getAccessTokenByEmailFn ?? getUiOidcAccessTokenByEmail;
  const rawSessionResult = injected?.sessionStoreDeps
    ? await (getSession as unknown as (r: Request, d: unknown) => Promise<unknown>)(
        req,
        injected.sessionStoreDeps as unknown,
      )
    : await (getSession as unknown as (r: Request) => Promise<unknown>)(req);
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
  let upstreamAccessToken: string | undefined = hasWrappedSession ? rawSessionResult.upstreamAccessToken : undefined;

  const context = await services.uiApi.loadUserContext(session.email);
  const ssoUserId = resolveCstarSsoUserId(session.claims, session.subject, session.email);
  // Unauthenticated-by-n8n identities keep `n8nUser: null`; they hold a UI session
  // with access-request capabilities only, never a synthetic enabled n8n user.
  const resolvedN8nUser = serializeN8nUser(context.n8nUser);

  const refreshAccessToken = async () => {
    const result = injected?.sessionStoreDeps
      ? ((await (refreshSessionByEmail as unknown as (e: string, t: unknown, d: unknown) => Promise<unknown>)(
          session.email,
          undefined,
          injected.sessionStoreDeps as unknown,
        )) as unknown as Awaited<ReturnType<typeof refreshSessionByEmail>>)
      : await refreshSessionByEmail(session.email);
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
    upstreamAccessToken = (access as string | null) ?? undefined;
  }

  return {
    session: {
      ...session,
      n8nUser: resolvedN8nUser,
      permissions: computePermissions(resolvedN8nUser, services.featureFlag),
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

function createUiRequestContextMiddleware(services: ApiRouteContext['services'], injected?: UiRequestContextDeps) {
  return async (req: UiApiMutableRequest, _res: Response, next: NextFunction) => {
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

function requireUiRequestContextMiddleware(services: ApiRouteContext['services'], injected?: UiRequestContextDeps) {
  const loadUiRequestContext = createUiRequestContextMiddleware(services, injected);

  return async (req: UiApiMutableRequest, res: Response, next: NextFunction) => {
    await loadUiRequestContext(req, res, (error?: unknown) => {
      if (error) {
        throw error;
      }
    });

    if (!req.session || !req.context) {
      UnauthorizedResponse(res);
      return;
    }

    next();
  };
}

export { createUiRequestContextMiddleware, requireUiRequestContextMiddleware, resolveUiRequestContext };

function checkPermission(permissionKey: keyof Permissions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const hasPermission = (req as UiApiRequest).session?.permissions?.[permissionKey];
    if (!hasPermission) {
      ForbiddenResponse(res);
      return;
    }
    next();
  };
}

function checkRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const n8nUser = (req as UiApiRequest).session?.n8nUser;
    // Disabled users must not pass role guards even when a stale role remains in the database.
    if (!n8nUser || n8nUser.disabled || !n8nUser.role || !allowedRoles.includes(n8nUser.role.slug)) {
      ForbiddenResponse(res);
      return;
    }
    next();
  };
}

export function buildUiApiRouter(routeContext: ApiRouteContext) {
  const { services } = routeContext;
  const router = Router();
  const requireUiRequestContext = requireUiRequestContextMiddleware(services);
  const returnTargetPolicy = createReturnTargetPolicy();

  router.get('/session', async (req, res) => {
    const resolved = await resolveUiRequestContext(req, services);
    if (resolved?.refreshedToken) {
      extendN8nAuthCookie(req, res);
    } else if (shouldClearN8nCookieOnExpiry(req, resolved)) {
      clearN8nAuthCookie(res);
    }
    setRefreshedUiTokenHeader(res, resolved?.refreshedToken);

    res.json(buildSessionSummary(resolved?.session ?? null));
  });

  // Deprecated compatibility alias — redirects only, never establishes a session
  // or trusts identity. The sole authorization flow is GET /rest/auth/oidc/callback.
  // Retained as a redirect alias for deployed callers; removal target: next minor
  // after provider docs confirm only the unified callback is registered (expected 2026-09-30).
  router.get('/auth/login', async (req, res) => {
    const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/ui/';
    res.redirect(appendQueryParam(`${N8N_BASE_URL}/rest/auth/oidc/login`, 'returnTo', returnTo));
  });

  router.post(
    '/auth/exchange',
    createRequestParser(authExchangeSchema),
    async (req: UiApiTypedRequest<zInfer<typeof authExchangeSchema>>, res) => {
      const exchange = await consumeUiSessionExchange(req.parsed.body.session);
      if (!exchange) {
        UnauthorizedResponse(res);
        return;
      }

      OkResponse(res, { token: exchange.token }, authExchangeResponseSchema);
    },
  );

  const UI_LOGOUT_HANDLE_TTL_MS = 60 * 1000;

  // Authenticated logout preparation: derive identity from the verified bearer
  // session and return a short-lived, single-use opaque logout handle bound to
  // the validated return target. The canonical OIDC logout endpoint consumes
  // the handle and never trusts caller-supplied identity or destinations.
  router.post(
    '/auth/logout-prepare',
    createRequestParser(authLogoutPrepareSchema),
    async (req: UiApiTypedRequest<zInfer<typeof authLogoutPrepareSchema>>, res) => {
      const sessionResult = await getUiSession(req);
      const session = sessionResult && 'session' in sessionResult ? sessionResult.session : null;
      if (!session?.email) {
        UnauthorizedResponse(res);
        return;
      }

      const returnTo =
        resolveReturnTarget(req.parsed.body?.returnTo, 'logout', returnTargetPolicy) ?? returnTargetPolicy.fallback;
      const handle = randomBytes(24).toString('base64url');
      await setUiLogoutHandle(handle, { email: session.email, returnTo }, UI_LOGOUT_HANDLE_TTL_MS);

      OkResponse(
        res,
        { logoutUrl: appendQueryParam(`${N8N_BASE_URL}/rest/auth/oidc/logout`, 'logout', handle) },
        authLogoutPrepareResponseSchema,
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
    res.redirect(appendQueryParam(`${N8N_BASE_URL}/rest/auth/oidc/logout`, 'returnTo', returnTo));
  });

  router.get('/whoami', requireUiRequestContext, async (req, res) => {
    const { session } = req as UiApiRequest;

    OkResponse(res, buildWhoamiResponse(session, req.get('user-agent')));
  });

  router.get('/workflows', requireUiRequestContext, checkPermission('canViewWorkflows'), async (req, res) => {
    const { context } = req as UiApiRequest;

    OkResponse(res, context.workflows);
  });

  router.post(
    '/workflows/:workflowId/share',
    requireUiRequestContext,
    checkPermission('canShareWorkflows'),
    createRequestParser(shareWorkflowSchema),
    async (req: UiApiTypedRequest<zInfer<typeof shareWorkflowSchema>>, res) => {
      const result = await services.uiApi.shareWorkflow(
        req.session.email,
        req.parsed.params.workflowId,
        req.parsed.body.email,
      );

      CreatedResponse(
        res,
        {
          workflowId: result.workflowId,
          sharedWithEmail: result.sharedWithEmail,
        },
        shareWorkflowResponseSchema,
      );
    },
  );

  router.delete(
    '/workflows/:workflowId/projects/:projectId',
    requireUiRequestContext,
    checkPermission('canUnshareWorkflows'),
    createRequestParser(unshareWorkflowSchema),
    async (req: UiApiTypedRequest<zInfer<typeof unshareWorkflowSchema>>, res) => {
      const result = await services.uiApi.unshareWorkflow(
        req.session.email,
        req.parsed.params.workflowId,
        req.parsed.params.projectId,
      );

      OkResponse(
        res,
        {
          workflowId: result.workflowId,
          projectId: result.projectId,
        },
        unshareWorkflowResponseSchema,
      );
    },
  );

  router.post(
    '/access-requests',
    requireUiRequestContext,
    checkPermission('canRequestAccess'),
    createRequestParser(createAccessRequestSchema),
    async (req: UiApiTypedRequest<zInfer<typeof createAccessRequestSchema>>, res) => {
      const accessRequest = await services.accessRequest.createAccessRequest({
        requesterEmail: req.session.email,
        justification: req.parsed.body.justification,
      });

      CreatedResponse(
        res,
        {
          accessRequest,
        },
        createAccessRequestResponseSchema,
      );
    },
  );

  router.get('/access-requests/my', requireUiRequestContext, async (req, res) => {
    const session = (req as UiApiRequest).session;

    const accessRequest = await services.accessRequest.getMyAccessRequest(session.email);

    OkResponse(
      res,
      {
        accessRequest,
      },
      getMyAccessRequestResponseSchema,
    );
  });

  router.get(
    '/access-requests',
    requireUiRequestContext,
    checkRole('global:owner', 'global:admin'),
    createRequestParser(listAccessRequestsSchema),
    async (req: UiApiTypedRequest<zInfer<typeof listAccessRequestsSchema>>, res) => {
      const { status, search, limit, offset } = req.parsed.query ?? {};

      const result = await services.accessRequest.listAccessRequests({
        status,
        search,
        limit: limit ?? 50,
        offset: offset ?? 0,
      });

      OkResponse(res, result, accessRequestListResponseSchema);
    },
  );

  router.post(
    '/access-requests/:id/review',
    requireUiRequestContext,
    checkRole('global:owner', 'global:admin'),
    createRequestParser(reviewAccessRequestSchema),
    async (req: UiApiTypedRequest<zInfer<typeof reviewAccessRequestSchema>>, res) => {
      const result = await services.accessRequest.reviewAccessRequest({
        accessRequestId: req.parsed.params.id,
        action: req.parsed.body.action,
        reviewerEmail: req.session.email,
        reviewerN8nUserId: req.session.n8nUser?.id ?? '',
        denyReason: req.parsed.body.denyReason,
      });

      OkResponse(
        res,
        {
          accessRequest: result,
        },
        reviewAccessRequestResponseSchema,
      );
    },
  );

  // List user personal project and their tenant projects (non-admin API)
  // Upstream credential is resolved from the authenticated session context (server-side store / refresh),
  // never by rereading the UI bearer (which is an app JWT in separate-token mode).
  router.get('/projects', requireUiRequestContext, checkPermission('canManageProject'), async (req, res) => {
    const session = (req as UiApiRequest).session;
    const upstreamAccessToken = session.upstreamAccessToken ?? '';
    const ssoUserId = resolveCstarSsoUserId(session.claims, session.subject, session.email);
    const n8nUserId = session.n8nUser?.id ?? '';

    const data = await services.projectTenant.listUserProjectTenants({
      ssoUserId,
      n8nUserId,
      upstreamAccessToken,
    });

    OkResponse(res, { data });
  });

  // Mount admin project-tenant sub-router (UI session auth + admin role + canManageProject)
  router.use(
    '/admin',
    requireUiRequestContext,
    checkPermission('canManageProject'),
    checkRole('global:owner', 'global:admin'),
    buildAdminProjectRouter(routeContext),
  );

  // Mount WIL sub-router (protected by requireUiRequestContext + canManageWil)
  router.use('/wil', requireUiRequestContext, checkPermission('canManageWil'), buildWilRouter(routeContext));

  return router;
}
