import { Router, type NextFunction, type Request, type Response } from 'express';
import { OkResponse, CreatedResponse, UnauthorizedResponse } from './responses';
import type { ApiRouteContext } from '../types/routes';
import { createRequestSchemaValidator, parseValidatedRequest } from '../utils/validation';
import {
  shareWorkflowResponseSchema,
  shareWorkflowSchema,
  unshareWorkflowResponseSchema,
  unshareWorkflowSchema,
} from '../schemas/ui';
import { completeUiLogin, buildUiLoginRedirect } from '../helpers/ui-oidc-auth';
import { getUiSession, getUiSessionSummary, createUiAuthToken, serializeN8nUser } from '../helpers/ui-oidc-session';
import type { UiAuthenticatedSession } from '../helpers/ui-oidc';
import type { UiApiContext } from '../types/ui-api';

type UiApiRequest = Request & {
  session: UiAuthenticatedSession;
  context: UiApiContext;
};

type UiApiMutableRequest = Request & {
  session?: UiAuthenticatedSession;
  context?: UiApiContext;
};

function appendTokenToReturnTo(returnTo: string, token: string) {
  return appendQueryParam(returnTo, 'token', token);
}

function appendQueryParam(returnTo: string, key: string, value: string) {
  try {
    const url = new URL(returnTo);
    url.searchParams.set(key, value);
    return url.toString();
  } catch {
    const separator = returnTo.includes('?') ? '&' : '?';
    return `${returnTo}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

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
    createRequestSchemaValidator(shareWorkflowSchema),
    async (req, res) => {
      const parsed = parseValidatedRequest(shareWorkflowSchema, req);
      const result = await services.uiApi.shareWorkflow(
        (req as UiApiRequest).session.email,
        parsed.params.workflowId,
        parsed.body.email,
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
    createRequestSchemaValidator(unshareWorkflowSchema),
    async (req, res) => {
      const parsed = parseValidatedRequest(unshareWorkflowSchema, req);
      const result = await services.uiApi.unshareWorkflow(
        (req as UiApiRequest).session.email,
        parsed.params.workflowId,
        parsed.params.projectId,
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

  return router;
}
