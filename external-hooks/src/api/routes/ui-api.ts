import { randomBytes } from 'crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { type infer as zInfer } from 'zod';
import { OkResponse, CreatedResponse, ForbiddenResponse, UnauthorizedResponse } from './responses';
import type { ApiRouteContext } from '../types/routes';
import { createRequestParser } from '../utils/validation';
import {
  authExchangeResponseSchema,
  authExchangeSchema,
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
import { issueUiSessionToken } from '../helpers/ui-auth-token';
import { completeUiLogin, buildUiLoginRedirect } from '../helpers/ui-oidc-auth';
import {
  consumeUiSessionExchange,
  deleteUiOidcTokens,
  getUiOidcIdToken,
  setUiOidcAccessTokenRecord,
  setUiOidcIdToken,
  setUiOidcRefreshToken,
  setUiSessionExchange,
} from '../helpers/ui-oidc-store';
import { fetchOidcDiscoveryDocument } from '../helpers/oidc-provider';
import { getUiSession, serializeN8nUser } from '../helpers/ui-oidc-session';
import { computePermissions } from '../helpers/permissions';
import { getOidcConfigFromEnv, buildSessionSummary, buildWhoamiResponse } from '../helpers/ui-oidc';
import { appendQueryParam, appendSessionToReturnTo } from '../helpers/url';
import type { UiApiRequest, UiApiTypedRequest } from '../types/ui-api';
import { buildWilRouter } from './wil';
import { createLogger } from '../utils/logger';

const log = createLogger('UiApi');

type UiApiMutableRequest = Request & {
  session?: UiApiRequest['session'];
  context?: UiApiRequest['context'];
};

const UI_SESSION_EXCHANGE_TTL_MS = 60 * 1000;

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
  const refreshedToken = hasWrappedSession ? rawSessionResult.refreshedToken : undefined;

  const context = await services.uiApi.loadUserContext(session.email);
  const resolvedN8nUser = serializeN8nUser(context.n8nUser) ?? {
    id: session.subject,
    email: session.email,
    disabled: false,
    role: null,
  };

  return {
    session: {
      ...session,
      n8nUser: resolvedN8nUser,
      permissions: computePermissions(resolvedN8nUser),
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

function requireGlobalAdminRole(req: Request, res: Response, next: NextFunction) {
  const roleSlug = (req as UiApiRequest).session?.n8nUser?.role?.slug;
  if (roleSlug !== 'global:owner' && roleSlug !== 'global:admin') {
    ForbiddenResponse(res);
    return;
  }
  next();
}

export function buildUiApiRouter(routeContext: ApiRouteContext) {
  const { services } = routeContext;
  const router = Router();
  const requireUiRequestContext = requireUiRequestContextMiddleware(services);

  router.get('/session', async (req, res) => {
    const resolved = await resolveUiRequestContext(req, services);
    setRefreshedUiTokenHeader(res, resolved?.refreshedToken);

    res.json(buildSessionSummary(resolved?.session ?? null));
  });

  router.get('/auth/login', async (req, res) => {
    const redirectUrl = await buildUiLoginRedirect(req);
    res.redirect(redirectUrl);
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

  router.get('/auth/callback', async (req, res) => {
    const result = await completeUiLogin(req);
    if (!result.ok) {
      res.redirect(appendQueryParam(result.returnTo, 'error', result.errorMessage));
      return;
    }

    let token: string;

    try {
      if (result.refreshToken) {
        await setUiOidcRefreshToken(result.email, result.refreshToken);
      }
      if (result.idToken) {
        await setUiOidcIdToken(result.email, result.idToken);
      }
      if (result.accessToken) {
        await setUiOidcAccessTokenRecord(result.email, result.accessToken, result.accessTokenExpiresAt);
      }

      token = await issueUiSessionToken({
        oidc: {
          subject: result.subject,
          email: result.email,
          preferredUsername: result.preferredUsername,
          name: result.name,
          issuer: result.issuer,
          audience: result.audience,
          claims: result.claims,
        },
        upstreamAccessToken: result.accessToken,
        upstreamExpiresAt: result.accessTokenExpiresAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to establish UI session';
      res.redirect(appendQueryParam(result.returnTo, 'error', message));
      return;
    }

    const sessionHandle = randomBytes(24).toString('base64url');
    await setUiSessionExchange(sessionHandle, token, UI_SESSION_EXCHANGE_TTL_MS);
    res.redirect(appendSessionToReturnTo(result.returnTo, sessionHandle));
  });

  router.get('/auth/logout', async (req, res) => {
    const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/ui/';
    const email = typeof req.query.email === 'string' ? req.query.email : '';

    if (!email) {
      log.debug('Logout requested without email, redirecting directly', { returnTo });
      res.redirect(returnTo);
      return;
    }

    const idToken = await getUiOidcIdToken(email);
    await deleteUiOidcTokens(email);

    if (!idToken) {
      log.debug('Logout: no ID token stored, redirecting directly', { email, returnTo });
      res.redirect(returnTo);
      return;
    }

    const config = getOidcConfigFromEnv();
    const discovery = await fetchOidcDiscoveryDocument(config);
    if (!discovery.end_session_endpoint) {
      log.debug('Logout: no end_session_endpoint in discovery, redirecting directly', { email, returnTo });
      res.redirect(returnTo);
      return;
    }

    log.info('Logout: redirecting to upstream IDP end_session_endpoint', { email, returnTo });
    const logoutUrl = new URL(discovery.end_session_endpoint);
    logoutUrl.searchParams.set('post_logout_redirect_uri', returnTo);
    logoutUrl.searchParams.set('id_token_hint', idToken);
    res.redirect(logoutUrl.toString());
  });

  router.get('/whoami', requireUiRequestContext, async (req, res) => {
    const { session } = req as UiApiRequest;

    OkResponse(res, buildWhoamiResponse(session, req.get('user-agent')));
  });

  router.get('/workflows', requireUiRequestContext, async (req, res) => {
    const { context } = req as UiApiRequest;

    OkResponse(res, context.workflows);
  });

  router.post(
    '/workflows/:workflowId/share',
    requireUiRequestContext,
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
    requireGlobalAdminRole,
    createRequestParser(listAccessRequestsSchema),
    async (req: UiApiTypedRequest<zInfer<typeof listAccessRequestsSchema>>, res) => {
      const { status, limit, offset } = req.parsed.query ?? {};

      const result = await services.accessRequest.listAccessRequests({
        status,
        limit: limit ?? 50,
        offset: offset ?? 0,
      });

      OkResponse(res, result, accessRequestListResponseSchema);
    },
  );

  router.post(
    '/access-requests/:id/review',
    requireUiRequestContext,
    requireGlobalAdminRole,
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

  // Mount WIL sub-router (protected by requireUiRequestContext)
  router.use('/wil', requireUiRequestContext, buildWilRouter(routeContext));

  return router;
}
