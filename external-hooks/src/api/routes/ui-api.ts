import { Router, type Request } from 'express';
import { createOidcJwtMiddleware } from '../middlewares';
import { wrapAsyncRoute } from '../utils/errors';

function getRequestOrigin(req: Request) {
  return req.get('origin') ?? `${req.protocol}://${req.get('host')}`;
}

export function buildUiApiRouter() {
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
        userAgent: req.get('user-agent') ?? null,
      });
    }),
  );

  return router;
}
