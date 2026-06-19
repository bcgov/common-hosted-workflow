import { Router, type NextFunction, type Request, type Response } from 'express';
import { type infer as zInfer } from 'zod';
import { OkResponse, CreatedResponse, ForbiddenResponse, UnauthorizedResponse } from './responses';
import type { ApiRouteContext } from '../types/routes';
import { createRequestParser } from '../utils/validation';
import {
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
import { getUiSession, serializeN8nUser } from '../helpers/ui-oidc-session';
import { computePermissions } from '../helpers/permissions';
import { appendQueryParam, appendTokenToReturnTo } from '../helpers/url';
import type { UiApiRequest, UiApiTypedRequest } from '../types/ui-api';
import { buildWilRouter } from './wil';

type UiApiMutableRequest = Request & {
  session?: UiApiRequest['session'];
  context?: UiApiRequest['context'];
};

async function resolveUiRequestContext(req: Request, services: ApiRouteContext['services']) {
  const session = await getUiSession(req);
  if (!session) {
    return null;
  }

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
  };
}

function createUiRequestContextMiddleware(services: ApiRouteContext['services']) {
  return async (req: UiApiMutableRequest, _res: Response, next: NextFunction) => {
    try {
      const resolved = await resolveUiRequestContext(req, services);
      if (resolved) {
        req.session = resolved.session;
        req.context = resolved.context;
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
    const session = resolved?.session;

    res.json(
      session
        ? {
            authenticated: true,
            user: {
              subject: session.subject,
              email: session.email,
              preferredUsername: session.preferredUsername,
              name: session.name,
            },
            oidc: {
              issuer: session.issuer,
              subject: session.subject,
              audience: session.audience,
              email: session.email,
              preferredUsername: session.preferredUsername,
              name: session.name,
              expiresAt: session.expiresAt,
              claims: session.claims,
            },
            n8nUser: session.n8nUser,
            permissions: session.permissions,
          }
        : { authenticated: false, user: null, oidc: null, n8nUser: null, permissions: null },
    );
  });

  router.get('/auth/login', async (req, res) => {
    const redirectUrl = await buildUiLoginRedirect(req);
    res.redirect(redirectUrl);
  });

  router.get('/auth/callback', async (req, res) => {
    const result = await completeUiLogin(req);
    if (!result.ok) {
      res.redirect(appendQueryParam(result.returnTo, 'error', result.errorMessage));
      return;
    }

    let token: string;

    try {
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

    res.redirect(appendTokenToReturnTo(result.returnTo, token));
  });

  router.get('/auth/logout', async (req, res) => {
    const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/ui/';
    res.redirect(returnTo);
  });

  router.get('/whoami', requireUiRequestContext, async (req, res) => {
    const { session } = req as UiApiRequest;

    OkResponse(res, {
      oidc: {
        issuer: session.issuer,
        subject: session.subject,
        audience: session.audience,
        email: session.email,
        preferredUsername: session.preferredUsername,
        name: session.name,
        expiresAt: session.expiresAt,
        claims: session.claims,
      },
      n8nUser: session.n8nUser,
      permissions: session.permissions,
      userAgent: req.get('user-agent'),
    });
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
