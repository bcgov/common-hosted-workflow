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
import { getBearerToken, getUiSession, serializeN8nUser, refreshSessionByEmail } from '../helpers/ui-oidc-session';
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

async function resolveUiRequestContext(req: Request, services: ApiRouteContext['services']) {
  const rawSessionResult = await getUiSession(req);
  if (!rawSessionResult) {
    return null;
  }

  const hasWrappedSession =
    typeof rawSessionResult === 'object' && rawSessionResult !== null && 'session' in rawSessionResult;
  const session = hasWrappedSession ? rawSessionResult.session : rawSessionResult;
  const sessionRefreshedToken = hasWrappedSession ? rawSessionResult.refreshedToken : undefined;

  const context = await services.uiApi.loadUserContext(session.email);
  const ssoUserId = resolveCstarSsoUserId(session.claims, session.subject, session.email);
  // Unauthenticated-by-n8n identities keep `n8nUser: null`; they hold a UI session
  // with access-request capabilities only, never a synthetic enabled n8n user.
  const resolvedN8nUser = serializeN8nUser(context.n8nUser);

  const refreshAccessToken = async () => {
    const result = await refreshSessionByEmail(session.email);
    if (!result) return null;
    if (!result.upstreamAccessToken) return null;
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

  return {
    session: {
      ...session,
      n8nUser: resolvedN8nUser,
      permissions: computePermissions(resolvedN8nUser, services.featureFlag),
      tenantRoles: tenantRolesResult.roles,
      tenantGroups: tenantGroupsResult.groups,
    },
    context,
    refreshedToken,
  };
}

function createUiRequestContextMiddleware(services: ApiRouteContext['services']) {
  return async (req: UiApiMutableRequest, _res: Response, next: NextFunction) => {
    try {
      const resolved = await resolveUiRequestContext(req, services);
      if (resolved) {
        req.session = resolved.session;
        req.context = resolved.context;
        setRefreshedUiTokenHeader(_res, resolved.refreshedToken);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireUiRequestContextMiddleware(services: ApiRouteContext['services']) {
  const loadUiRequestContext = createUiRequestContextMiddleware(services);

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

export { createUiRequestContextMiddleware, requireUiRequestContextMiddleware };

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
  router.get('/projects', requireUiRequestContext, checkPermission('canManageProject'), async (req, res) => {
    const session = (req as UiApiRequest).session;
    const accessToken = getBearerToken(req) ?? '';
    const ssoUserId = resolveCstarSsoUserId(session.claims, session.subject, session.email);
    const n8nUserId = session.n8nUser?.id ?? '';

    const data = await services.projectTenant.listUserProjectTenants({
      ssoUserId,
      n8nUserId,
      accessToken,
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
