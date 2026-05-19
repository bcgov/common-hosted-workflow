import { Router, type Request } from 'express';
import { createOidcJwtMiddleware } from '../middlewares';
import { wrapAsyncRoute } from '../utils/errors';
import type { ApiRouteContext } from '../types/routes';

function getRequestOrigin(req: Request) {
  return req.get('origin') ?? `${req.protocol}://${req.get('host')}`;
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
        oidc: details
          ? {
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
            }
          : null,
        n8nUser: n8nUser
          ? {
              id: n8nUser.id,
              email: n8nUser.email,
              role: n8nUser.role ? { slug: n8nUser.role.slug, displayName: n8nUser.role.displayName } : null,
            }
          : null,
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
        n8nUser: context.n8nUser
          ? {
              id: context.n8nUser.id,
              email: context.n8nUser.email,
              role: context.n8nUser.role
                ? { slug: context.n8nUser.role.slug, displayName: context.n8nUser.role.displayName }
                : null,
            }
          : null,
        accessibleProjectIds: context.accessibleProjectIds,
        workflows: context.workflows,
      });
    }),
  );

  return router;
}
