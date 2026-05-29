import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { beginOidcAuthorization, completeOidcAuthorization, extractOidcIdentity } from '../helpers/oidc-provider';
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
import { createLogger, logError } from '../utils/logger';

const log = createLogger('OIDCHook');

type N8nOidcUserQueryBuilder = {
  innerJoin(join: string, alias: string): N8nOidcUserQueryBuilder;
  where(query: string, params: { ownerRole: N8nOidcRoleSlug }): N8nOidcUserQueryBuilder;
  andWhere(query: string, params: { userId: string }): { getCount(): Promise<number> };
};

export type N8nOidcDbCollections = {
  User: {
    findOne(options: { where: { email: string }; relations: string[] }): Promise<N8nOidcUser | null>;
    count(): Promise<number>;
    createQueryBuilder(alias: string): N8nOidcUserQueryBuilder;
    createUserWithProject(userData: {
      email: string;
      firstName: string;
      lastName: string;
      password: string;
      role: { slug: N8nOidcRoleSlug | 'global:member' };
    }): Promise<{ user: N8nOidcUser }>;
  };
};

export type N8nOidcJwtService = {
  sign: (payload: { id: string; hash: string; usedMfa: boolean }, options: { expiresIn: string }) => string;
};

export type N8nOidcUserService = {
  changeUserRole(user: N8nOidcUser, options: { newRoleName: string }): Promise<void>;
};

export type BuildOidcRouterParams = {
  dbCollections: N8nOidcDbCollections;
  jwtService: N8nOidcJwtService;
  userService: N8nOidcUserService;
  config: N8nOidcConfig;
};

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.N8N_PROTOCOL === 'https',
    sameSite: 'lax' as const,
    maxAge: 15 * 60 * 1000,
  };
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.N8N_PROTOCOL === 'https',
    sameSite: 'lax' as const,
    maxAge: 24 * 60 * 60 * 1000,
  };
}

export function buildOidcRouter({ dbCollections, jwtService, userService, config }: BuildOidcRouterParams) {
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
      res.status(500).send('OIDC configuration error. Please check the logs.');
    }
  });

  router.get('/callback', async (req: Request, res: Response) => {
    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        log.error('OIDC error from provider', { error, errorDescription: error_description });
        return res.redirect('/signin?error=' + encodeURIComponent(error_description || error));
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

      const jwtRole = parseN8nOidcRole(identity.claims[config.rolesClaim]);

      const { User } = dbCollections;

      let user = await User.findOne({
        where: { email: identity.email },
        relations: ['role'],
      });

      if (!user) {
        if (config.restrictNoRole && !jwtRole) {
          log.warn('Skipping user creation because token did not include a role', {
            email: identity.email,
          });
          return res.redirect('/signin?error=' + encodeURIComponent('No role found in OIDC response'));
        }

        const userCount = await User.count();
        let role = userCount === 0 ? 'global:owner' : 'global:member';
        if (jwtRole) role = jwtRole;

        const givenName = typeof identity.claims.given_name === 'string' ? identity.claims.given_name : undefined;
        const familyName = typeof identity.claims.family_name === 'string' ? identity.claims.family_name : undefined;

        const userData = {
          email: identity.email,
          firstName: givenName || identity.name?.split(' ')[0] || 'User',
          lastName: familyName || identity.name?.split(' ').slice(1).join(' ') || '',
          password: crypto.randomBytes(32).toString('hex'),
          role: { slug: role },
        };

        const result = await User.createUserWithProject(userData);
        user = result.user;

        log.info('Created user with personal project', { role, email: identity.email });
      }

      if (!user) {
        return res.redirect('/signin?error=' + encodeURIComponent('Failed to create or find user'));
      }

      const currentRole = user.role?.slug || '';
      const nextRole = config.restrictNoRole ? jwtRole : jwtRole || 'global:member';
      let shouldUpdateRole = true;

      if (currentRole !== nextRole) {
        if (currentRole === 'global:owner' && nextRole !== 'global:owner') {
          const otherOwnerCount = await User.createQueryBuilder('user')
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

        if (shouldUpdateRole) {
          await userService.changeUserRole(user, { newRoleName: nextRole });
          log.info('User role updated', {
            previousRole: currentRole,
            newRole: nextRole,
            email: identity.email,
          });
        }
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
