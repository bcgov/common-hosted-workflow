import { Router, type Request, type Response } from 'express';
import type { ApiRouteContext } from '../types/routes';
import { wrapAsyncRoute } from '../utils/errors';
import { createRequestSchemaValidator, parseValidatedRequest, parseValidatedResponse } from '../utils/validation';
import {
  shareWorkflowResponseSchema,
  shareWorkflowSchema,
  unshareWorkflowResponseSchema,
  unshareWorkflowSchema,
} from '../schemas/ui';
import { completeUiLogin, buildUiLoginRedirect } from '../helpers/ui-oidc-auth';
import { getUiSession, getUiSessionSummary, createUiAuthToken, serializeN8nUser } from '../helpers/ui-oidc-session';
import type { UiAuthenticatedSession } from '../helpers/ui-oidc';

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

function buildUnauthorizedResponse(route: string, method: string, userAgent: string | null) {
  return { ok: false, route, method, userAgent };
}

function getRequestUserAgent(req: Request) {
  return req.get('user-agent') ?? null;
}

async function requireUiSession(req: Request, res: Response, route: string): Promise<UiAuthenticatedSession | null> {
  const session = await getUiSession(req);
  if (session) {
    return session;
  }

  res.status(401).json(buildUnauthorizedResponse(route, req.method, getRequestUserAgent(req)));
  return null;
}

export function buildUiApiRouter({ services }: ApiRouteContext) {
  const router = Router();

  router.get(
    '/session',
    wrapAsyncRoute(async (req, res) => {
      res.json(await getUiSessionSummary(req));
    }),
  );

  router.get(
    '/auth/login',
    wrapAsyncRoute(async (req, res) => {
      const redirectUrl = await buildUiLoginRedirect(req);
      res.redirect(redirectUrl);
    }),
  );

  router.get(
    '/auth/callback',
    wrapAsyncRoute(async (req, res) => {
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
    }),
  );

  router.get(
    '/auth/logout',
    wrapAsyncRoute(async (req, res) => {
      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/ui/';
      res.redirect(returnTo);
    }),
  );

  router.get(
    '/whoami',
    wrapAsyncRoute(async (req, res) => {
      const session = await requireUiSession(req, res, '/ui-api/whoami');
      if (!session) {
        return;
      }

      res.json({
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
        userAgent: getRequestUserAgent(req),
      });
    }),
  );

  router.get(
    '/workflows',
    wrapAsyncRoute(async (req, res) => {
      const session = await requireUiSession(req, res, '/ui-api/workflows');
      if (!session) {
        return;
      }

      const context = await services.uiApi.getWorkflows(session.email);

      res.json({
        ok: true,
        route: '/ui-api/workflows',
        method: req.method,
        n8nUser: serializeN8nUser(context.n8nUser),
        accessibleProjectIds: context.accessibleProjectIds,
        workflows: context.workflows,
      });
    }),
  );

  router.post(
    '/workflows/:workflowId/share',
    createRequestSchemaValidator(shareWorkflowSchema),
    wrapAsyncRoute(async (req, res) => {
      const session = await requireUiSession(req, res, '/ui-api/workflows/:workflowId/share');
      if (!session) {
        return;
      }

      const parsed = parseValidatedRequest(shareWorkflowSchema, req);
      const result = await services.uiApi.shareWorkflow(session.email, parsed.params.workflowId, parsed.body.email);

      const payload = parseValidatedResponse(shareWorkflowResponseSchema, {
        success: true as const,
        message: `Workflow '${result.workflowId}' shared with '${result.sharedWithEmail}'.`,
        workflowId: result.workflowId,
        sharedWithEmail: result.sharedWithEmail,
      });

      res.status(201).json(payload);
    }),
  );

  router.delete(
    '/workflows/:workflowId/projects/:projectId',
    createRequestSchemaValidator(unshareWorkflowSchema),
    wrapAsyncRoute(async (req, res) => {
      const session = await requireUiSession(req, res, '/ui-api/workflows/:workflowId/projects/:projectId');
      if (!session) {
        return;
      }

      const parsed = parseValidatedRequest(unshareWorkflowSchema, req);
      const result = await services.uiApi.unshareWorkflow(
        session.email,
        parsed.params.workflowId,
        parsed.params.projectId,
      );

      const payload = parseValidatedResponse(unshareWorkflowResponseSchema, {
        success: true as const,
        message: `Workflow '${result.workflowId}' unshared from project '${result.projectId}'.`,
        workflowId: result.workflowId,
        projectId: result.projectId,
      });

      res.status(200).json(payload);
    }),
  );

  return router;
}
