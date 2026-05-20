import { Router, type Request } from 'express';
import { createOidcJwtMiddleware } from '../middlewares';
import { wrapAsyncRoute } from '../utils/errors';
import type { ApiRouteContext } from '../types/routes';
import type { OidcTokenDetails } from '../types/oidc';
import { createRequestSchemaValidator, parseValidatedRequest, parseValidatedResponse } from '../utils/validation';
import {
  shareWorkflowResponseSchema,
  shareWorkflowSchema,
  unshareWorkflowResponseSchema,
  unshareWorkflowSchema,
} from '../schemas/ui';

function getRequestOrigin(req: Request) {
  return req.get('origin') ?? `${req.protocol}://${req.get('host')}`;
}

function serializeRole(role: { slug: string; displayName: string } | null | undefined) {
  return role ? { slug: role.slug, displayName: role.displayName } : null;
}

function serializeN8nUser(
  user: { id: string; email: string; role: { slug: string; displayName: string } | null } | null,
) {
  return user ? { id: user.id, email: user.email, role: serializeRole(user.role) } : null;
}

function serializeOidcDetails(details: OidcTokenDetails | undefined) {
  if (!details) return null;
  return {
    issuer: details.issuer,
    subject: details.subject,
    audience: details.audience,
    azp: details.azp,
    email: details.email,
    preferredUsername: details.preferredUsername,
    name: details.name,
    scope: details.scope,
    expiresAt: details.expiresAt,
    issuedAt: details.issuedAt,
    notBefore: details.notBefore,
    claims: details.claims,
  };
}

export function buildUiApiRouter({ services }: ApiRouteContext) {
  const router = Router();
  const oidcJwtMiddleware = createOidcJwtMiddleware({
    issuer: process.env.UI_OIDC_EXPECTED_ISSUER || '',
    jwksUri: process.env.UI_OIDC_JWKS_URI || '',
    expectedAzp: process.env.UI_OIDC_EXPECTED_AZP,
    expectedAudience: process.env.UI_OIDC_EXPECTED_AUDIENCE,
  });

  router.get(
    '/runtime-config',
    wrapAsyncRoute(async (req, res) => {
      const origin = getRequestOrigin(req);

      res.json({
        issuer: process.env.UI_OIDC_ISSUER,
        clientId: process.env.UI_OIDC_CLIENT_ID || 'external-ui',
        redirectUri: process.env.UI_OIDC_REDIRECT_URI || `${origin}/ui/auth/callback`,
        postLogoutRedirectUri: process.env.UI_OIDC_POST_LOGOUT_URI || `${origin}/ui/`,
        scopes: process.env.UI_OIDC_SCOPES || 'openid email profile',
      });
    }),
  );

  router.get(
    '/whoami',
    oidcJwtMiddleware,
    wrapAsyncRoute(async (req, res) => {
      const details = res.locals.oidcTokenDetails;
      const n8nUser = await services.uiApi.getWhoami(details.email);

      res.json({
        ok: true,
        route: '/ui-api/whoami',
        method: req.method,
        oidc: serializeOidcDetails(details),
        n8nUser: serializeN8nUser(n8nUser),
        userAgent: req.get('user-agent') ?? null,
      });
    }),
  );

  router.get(
    '/workflows',
    oidcJwtMiddleware,
    wrapAsyncRoute(async (req, res) => {
      const details = res.locals.oidcTokenDetails;
      const context = await services.uiApi.getWorkflows(details.email);

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
    oidcJwtMiddleware,
    createRequestSchemaValidator(shareWorkflowSchema),
    wrapAsyncRoute(async (req, res) => {
      const details = res.locals.oidcTokenDetails;
      const parsed = parseValidatedRequest(shareWorkflowSchema, req);
      const result = await services.uiApi.shareWorkflow(details.email, parsed.params.workflowId, parsed.body.email);

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
    oidcJwtMiddleware,
    createRequestSchemaValidator(unshareWorkflowSchema),
    wrapAsyncRoute(async (req, res) => {
      const details = res.locals.oidcTokenDetails;
      const parsed = parseValidatedRequest(unshareWorkflowSchema, req);
      const result = await services.uiApi.unshareWorkflow(
        details.email,
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
