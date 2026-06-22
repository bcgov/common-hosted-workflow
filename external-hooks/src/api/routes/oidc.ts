import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { N8N_PROTOCOL } from '@config';
import { beginOidcAuthorization, completeOidcAuthorization, extractOidcIdentity } from '../helpers/oidc-provider';
import {
  setUiOidcAccessTokenRecord,
  setUiOidcIdToken,
  setUiOidcRefreshToken,
  setUiSessionExchange,
} from '../helpers/ui-oidc-store';
import {
  createAuthToken,
  createSignedCookie,
  getCookieSecret,
  isValidEmail,
  type N8nOidcConfig,
  type N8nOidcNonceCookiePayload,
  type N8nOidcRoleSlug,
  type N8nOidcStateCookiePayload,
  type N8nOidcUser,
  parseN8nOidcRole,
  verifySignedCookie,
} from '../helpers/n8n-oidc';
import { issueUiSessionToken, resolveAccessTokenExpiresAt } from '../helpers/ui-auth-token';
import type { UiOidcIdentity } from '../helpers/ui-oidc';
import { appendSessionToReturnTo, buildUiAppUrl } from '../helpers/url';
import { createLogger, logError } from '../utils/logger';
import { InternalServerErrorResponse } from './responses';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { JwtService } from '../services/jwt';
import type { UserService } from '../services/user';

const log = createLogger('OIDCHook');
const UI_SESSION_EXCHANGE_TTL_MS = 60 * 1000;

export type BuildOidcRouterParams = {
  n8nRepositories: N8nRepositories;
  jwtService: JwtService;
  userService: UserService;
  config: N8nOidcConfig;
};

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: N8N_PROTOCOL === 'https',
    sameSite: 'lax' as const,
    maxAge: 15 * 60 * 1000,
  };
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: N8N_PROTOCOL === 'https',
    sameSite: 'lax' as const,
    maxAge: 24 * 60 * 60 * 1000,
  };
}

async function redirectToAccessRequest(
  params: {
    user: N8nOidcUser | null;
    identity: UiOidcIdentity;
    accessToken?: string;
    accessTokenExpiresAt?: number;
  },
  res: Response,
) {
  const uiToken = await issueUiSessionToken({
    oidc: params.identity,
    upstreamAccessToken: params.accessToken,
    upstreamExpiresAt: params.accessTokenExpiresAt,
  });

  const sessionHandle = crypto.randomBytes(24).toString('base64url');
  await setUiSessionExchange(sessionHandle, uiToken, UI_SESSION_EXCHANGE_TTL_MS);
  return res.redirect(appendSessionToReturnTo(buildUiAppUrl('/access-request'), sessionHandle));
}

export function buildOidcRouter({ n8nRepositories, jwtService, userService, config }: BuildOidcRouterParams) {
  const { user: userRepository } = n8nRepositories;
  const router = Router();
  const cookieSecret = getCookieSecret();

  router.get('/login', async (req: Request, res: Response) => {
    try {
      const authRequest = await beginOidcAuthorization({
        config,
        redirectUri: config.redirectUri,
        usePkce: true,
      });

      res.cookie(
        'n8n-oidc-state',
        createSignedCookie(
          {
            state: authRequest.state,
            codeVerifier: authRequest.codeVerifier,
            redirectUri: authRequest.redirectUri,
          },
          cookieSecret,
        ),
        getCookieOptions(),
      );
      res.cookie('n8n-oidc-nonce', createSignedCookie({ nonce: authRequest.nonce }, cookieSecret), getCookieOptions());

      res.redirect(authRequest.authorizationUrl);
    } catch (error) {
      logError(log, error, { context: 'OIDC login' });
      InternalServerErrorResponse(res, { context: 'OIDC login' });
    }
  });

  router.get('/callback', async (req: Request, res: Response) => {
    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        log.error('OIDC error from provider', { error, errorDescription: error_description });
        return res.redirect('/signin?error=' + encodeURIComponent(String(error_description || error)));
      }

      if (!code || !state) {
        return res.redirect('/signin?error=' + encodeURIComponent('Missing authorization code or state'));
      }

      const stateCookie = req.cookies['n8n-oidc-state'];
      const nonceCookie = req.cookies['n8n-oidc-nonce'];

      if (!stateCookie || !nonceCookie) {
        return res.redirect('/signin?error=' + encodeURIComponent('Missing state cookies - session expired'));
      }

      const statePayload = verifySignedCookie(stateCookie, cookieSecret) as N8nOidcStateCookiePayload | null;
      const noncePayload = verifySignedCookie(nonceCookie, cookieSecret) as N8nOidcNonceCookiePayload | null;

      if (!statePayload || statePayload.state !== state) {
        return res.redirect('/signin?error=' + encodeURIComponent('Invalid state - possible CSRF attack'));
      }

      res.clearCookie('n8n-oidc-state');
      res.clearCookie('n8n-oidc-nonce');

      const completion = await completeOidcAuthorization({
        code: code as string,
        storedState: {
          nonce: noncePayload?.nonce || '',
          codeVerifier: statePayload?.codeVerifier,
          redirectUri: statePayload?.redirectUri || config.redirectUri,
        },
        config,
      });

      const identity = extractOidcIdentity({
        claims: completion.mergedClaims,
        discovery: completion.discovery,
        config,
      });

      if (!identity.email || !isValidEmail(identity.email)) {
        return res.redirect('/signin?error=' + encodeURIComponent('No valid email in OIDC response'));
      }

      const oidcIdentity: UiOidcIdentity = {
        subject: identity.subject || identity.email,
        email: identity.email,
        preferredUsername: identity.preferredUsername,
        name: identity.name,
        issuer: completion.discovery.issuer || config.issuerUrl,
        audience: [config.clientId],
        claims: identity.claims,
      };
      const accessTokenExpiresAt = resolveAccessTokenExpiresAt(completion.tokens.expires_in);

      if (completion.tokens.refresh_token) {
        await setUiOidcRefreshToken(identity.email, completion.tokens.refresh_token);
      }
      if (completion.tokens.id_token) {
        await setUiOidcIdToken(identity.email, completion.tokens.id_token);
      }
      if (completion.tokens.access_token) {
        await setUiOidcAccessTokenRecord(identity.email, completion.tokens.access_token, accessTokenExpiresAt);
      }

      const jwtRole = parseN8nOidcRole(identity.claims[config.rolesClaim]);
      const nextRole = config.restrictNoRole ? (jwtRole ?? '') : jwtRole || 'global:member';

      let user = await userRepository.findByEmail(identity.email, ['role']);

      if (!user) {
        if (!nextRole) {
          log.info('No OIDC role for new user, redirecting to access request page without creating n8n user', {
            email: identity.email,
          });
          return await redirectToAccessRequest(
            {
              user: null,
              identity: oidcIdentity,
              accessToken: completion.tokens.access_token,
              accessTokenExpiresAt,
            },
            res,
          );
        }

        const userCount = await userRepository.count();
        const resolvedRole = userCount === 0 ? 'global:owner' : nextRole;

        if (resolvedRole) {
          const givenName = typeof identity.claims.given_name === 'string' ? identity.claims.given_name : undefined;
          const familyName = typeof identity.claims.family_name === 'string' ? identity.claims.family_name : undefined;

          const userData = {
            email: identity.email,
            firstName: givenName || identity.name?.split(' ')[0] || 'User',
            lastName: familyName || identity.name?.split(' ').slice(1).join(' ') || '',
            password: crypto.randomBytes(32).toString('hex'),
            disabled: !nextRole,
            role: { slug: resolvedRole },
          };

          const result = await userRepository.createUserWithProject(userData);
          user = result.user;

          log.info('Created user with personal project', {
            role: resolvedRole,
            disabled: !nextRole,
            email: identity.email,
          });
        }
      }

      if (!user) {
        return res.redirect('/signin?error=' + encodeURIComponent('Failed to create or find user'));
      }

      const currentRole = user.role?.slug || '';
      let shouldUpdateRole = true;

      if (currentRole !== nextRole) {
        if (currentRole === 'global:owner' && nextRole !== 'global:owner') {
          const otherOwnerCount = await userRepository
            .createQueryBuilder('user')
            .innerJoin('user.role', 'role')
            .where('role.slug = :ownerRole', { ownerRole: 'global:owner' })
            .andWhere('user.id != :userId', { userId: user.id })
            .getCount();

          if (otherOwnerCount === 0) {
            shouldUpdateRole = false;
            log.warn('Not downgrading user role to avoid leaving system without an owner', {
              email: identity.email,
            });
          }
        }

        if (shouldUpdateRole && nextRole) {
          await userService.changeUserRole(user, { newRoleName: nextRole });
          log.info('User role updated', {
            previousRole: currentRole,
            newRole: nextRole,
            email: identity.email,
          });
        }
      }

      const shouldRedirectToAccessRequest = !nextRole;

      if (shouldRedirectToAccessRequest) {
        await userRepository.setUserDisabled(user.id, true);
        user.disabled = true;
        log.info('User disabled, redirecting to access request page', {
          email: identity.email,
        });

        return await redirectToAccessRequest(
          {
            user,
            identity: oidcIdentity,
            accessToken: completion.tokens.access_token,
            accessTokenExpiresAt,
          },
          res,
        );
      }

      if (user.disabled) {
        await userRepository.setUserDisabled(user.id, false);
        user.disabled = false;
        log.info('User re-enabled after receiving a valid OIDC role', {
          email: identity.email,
        });
      }

      const authToken = createAuthToken(user, jwtService);
      res.cookie('n8n-auth', authToken, getAuthCookieOptions());
      res.redirect('/');
    } catch (error) {
      logError(log, error, { context: 'OIDC callback' });
      const message = error instanceof Error ? error.message : String(error);
      res.redirect('/signin?error=' + encodeURIComponent('Authentication failed: ' + message));
    }
  });

  return router;
}
