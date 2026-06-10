import { Router, type NextFunction, type Request, type Response } from 'express';
import { z, type infer as zInfer } from 'zod';
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
import { completeUiLogin, buildUiLoginRedirect } from '../helpers/ui-oidc-auth';
import { getUiSession, getUiSessionSummary, createUiAuthToken, serializeN8nUser } from '../helpers/ui-oidc-session';
import { appendQueryParam, appendTokenToReturnTo } from '../helpers/url';
import type { UiApiRequest, UiApiTypedRequest } from '../types/ui-api';

type UiApiMutableRequest = Request & {
  session?: UiApiRequest['session'];
  context?: UiApiRequest['context'];
};

function createUiRequestContextMiddleware(services: ApiRouteContext['services']) {
  return async (req: UiApiMutableRequest, _res: Response, next: NextFunction) => {
    try {
      const session = await getUiSession(req);
      if (session) {
        req.session = session;
        req.context = await services.uiApi.loadUserContext(session.email);
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

export function buildUiApiRouter({ services }: ApiRouteContext) {
  const router = Router();
  const requireUiRequestContext = requireUiRequestContextMiddleware(services);

  router.get('/session', async (req, res) => {
    res.json(await getUiSessionSummary(req));
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

    const n8nUser = await services.uiApi.getWhoami(result.email);
    const token = await createUiAuthToken({
      oidc: {
        subject: result.subject,
        email: result.email,
        preferredUsername: result.preferredUsername,
        name: result.name,
        issuer: result.issuer,
        audience: result.audience,
        claims: result.claims,
      },
      n8nUser: serializeN8nUser(n8nUser) ?? { id: result.subject, email: result.email, role: null },
    });

    res.redirect(appendTokenToReturnTo(result.returnTo, token));
  });

  router.get('/auth/logout', async (req, res) => {
    const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/ui/';
    res.redirect(returnTo);
  });

  router.get('/whoami', requireUiRequestContext, async (req, res) => {
    const { session } = req as UiApiRequest;

    OkResponse(res, {
      ok: true,
      route: '/ui-api/whoami',
      method: req.method,
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
      userAgent: req.get('user-agent'),
    });
  });

  router.get('/workflows', requireUiRequestContext, async (req, res) => {
    const { context } = req as UiApiRequest;

    OkResponse(res, {
      ok: true,
      route: '/ui-api/workflows',
      method: req.method,
      n8nUser: serializeN8nUser(context.n8nUser),
      accessibleProjectIds: context.accessibleProjectIds,
      projects: context.projects,
      workflows: context.workflows,
    });
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
          success: true as const,
          message: `Workflow '${result.workflowId}' shared with '${result.sharedWithEmail}'.`,
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
          success: true as const,
          message: `Workflow '${result.workflowId}' unshared from project '${result.projectId}'.`,
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
          success: true as const,
          message: 'Access request submitted successfully.',
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
          success: true as const,
          message: `Access request ${req.parsed.body.action}d successfully.`,
          accessRequest: result,
        },
        reviewAccessRequestResponseSchema,
      );
    },
  );

  return router;
}
