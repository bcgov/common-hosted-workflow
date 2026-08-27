import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { N8N_PROTOCOL } from '@config';
import {
  beginOidcAuthorization,
  completeOidcAuthorization,
  extractOidcIdentity,
  fetchOidcDiscoveryDocument,
} from '../helpers/oidc-provider';
import {
  getUiOidcIdToken,
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
  type N8nOidcStateCookiePayload,
  type N8nOidcUser,
  parseN8nOidcRole,
  verifySignedCookie,
} from '../helpers/n8n-oidc';
import { issueUiSessionToken, resolveAccessTokenExpiresAt } from '../helpers/ui-auth-token';
import { resolveCstarSsoUserId } from '../helpers/cstar-sso-user-id';
import type { UiOidcIdentity } from '../helpers/ui-oidc';
import { getOidcConfigFromEnv } from '../helpers/ui-oidc';
import { appendSessionToReturnTo, buildUiAppUrl } from '../helpers/url';
import { isManagedProjectRole } from '../constants/project-roles';
import { createLogger, logError } from '../utils/logger';
import type { N8nUser } from '../types/user';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { AuthService } from '../services/auth';
import type { CstarService } from '../services/cstar.service';
import type { JwtService } from '../services/jwt';
import type { TenantProjectSyncService } from '../services/tenant-project-sync.service';
import type { UserService } from '../services/user';
import { ensurePersonalProjectTenantMapping } from '../services/personal-project-tenant';

const log = createLogger('OIDCHook');
const UI_SESSION_EXCHANGE_TTL_MS = 60 * 1000;

export type BuildOidcRouterParams = {
  n8nRepositories: N8nRepositories;
  customRepositories: CustomRepositories;
  authService: AuthService;
  jwtService: JwtService;
  userService: UserService;
  tenantProjectSyncService: TenantProjectSyncService;
  cstarService: CstarService;
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

function buildExternalUiErrorRedirect(message: string) {
  return '/ui?error=' + encodeURIComponent(message);
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

export function buildOidcRouter({
  n8nRepositories,
  customRepositories,
  authService,
  jwtService,
  userService,
  tenantProjectSyncService,
  cstarService,
  config,
}: BuildOidcRouterParams) {
  const { user: userRepository } = n8nRepositories;
  const router = Router();
  const cookieSecret = getCookieSecret();

  router.get('/login', async (req: Request, res: Response) => {
    const existingToken = req.cookies['n8n-auth'];
    if (existingToken) {
      try {
        const [user] = await authService.resolveJwt(existingToken, req, res);
        if (user) {
          log.debug('OIDC login: existing n8n session is valid, redirecting to app', { userId: user.id });
          return res.redirect('/');
        }
      } catch (error) {
        log.debug('OIDC login: existing n8n session is invalid, starting OIDC flow', { error: String(error) });
      }
    }

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
      const message = error instanceof Error ? error.message : String(error);
      res.redirect(buildExternalUiErrorRedirect(message));
    }
  });

  router.get('/callback', async (_req: Request, res: Response) => {
    try {
      const callbackResult = validateCallbackRequest(_req, cookieSecret);
      if (callbackResult.redirect) {
        return res.redirect(callbackResult.redirect);
      }

      const { code, statePayload, noncePayload } = callbackResult;
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
        return res.redirect(buildExternalUiErrorRedirect('No valid email in OIDC response'));
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

      await persistOidcTokens(identity.email, completion.tokens, accessTokenExpiresAt);

      const jwtRole = parseN8nOidcRole(identity.claims[config.rolesClaim]);
      const cstarSsoUserId = resolveCstarSsoUserId(identity.claims, identity.subject, identity.email);
      const nextRole = await resolveNextRole({
        jwtRole,
        restrictNoRole: config.restrictNoRole,
        cstarService,
        ssoUserId: cstarSsoUserId,
        accessToken: completion.tokens.access_token,
      });

      let user = await userRepository.findByEmail(identity.email, ['role']);

      if (!user) {
        const newUserResult = await handleNewUser({
          nextRole,
          identity,
          oidcIdentity,
          accessToken: completion.tokens.access_token,
          accessTokenExpiresAt,
          userRepository,
          res,
        });
        if (newUserResult.redirected) return;
        user = newUserResult.user;
      }

      if (!user) {
        return res.redirect(buildExternalUiErrorRedirect('Failed to create or find user'));
      }

      await syncUserRole(user, nextRole, userRepository, userService, identity.email);

      if (!nextRole) {
        await userRepository.setUserDisabled(user.id, true);
        user.disabled = true;
        log.info('User disabled, redirecting to access request page', { email: identity.email });

        return await redirectToAccessRequest(
          { user, identity: oidcIdentity, accessToken: completion.tokens.access_token, accessTokenExpiresAt },
          res,
        );
      }

      if (user.disabled) {
        await userRepository.setUserDisabled(user.id, false);
        user.disabled = false;
        log.info('User re-enabled after receiving a valid OIDC role', { email: identity.email });
      }

      await ensurePersonalProjectTenantMapping({
        userId: user.id,
        projectRepo: n8nRepositories.project,
        tenantProjectRelationRepository: customRepositories.tenantProjectRelation,
        reason: 'oidc-login',
      });

      // Sync tenant projects (non-blocking — errors are logged but don't fail login)
      if (completion.tokens.access_token) {
        tenantProjectSyncService
          .syncTenantsForUser({
            ssoUserId: cstarSsoUserId,
            n8nUserId: user.id,
            accessToken: completion.tokens.access_token,
          })
          .catch((err) => {
            log.error('Tenant project sync failed', { email: identity.email, error: String(err) });
          });
      }

      const authToken = createAuthToken(user, jwtService);
      res.cookie('n8n-auth', authToken, getAuthCookieOptions());
      res.redirect('/');
    } catch (error) {
      logError(log, error, { context: 'OIDC callback' });
      const message = error instanceof Error ? error.message : String(error);
      res.redirect(buildExternalUiErrorRedirect('Authentication failed: ' + message));
    }
  });

  router.get('/logout', async (req: Request, res: Response) => {
    try {
      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';

      const token = req.cookies['n8n-auth'];
      if (!token) {
        log.debug('OIDC logout: no user session cookie provided, redirecting directly', { returnTo });
        res.redirect(returnTo);
        return;
      }

      const [user] = await authService.resolveJwt(token, req, res);
      if (!user?.email) {
        log.debug('OIDC logout: no user or email provided, redirecting directly', { returnTo });
        res.redirect(returnTo);
        return;
      }

      const email = user.email.trim();

      await authService.invalidateToken(req as any);
      authService.clearCookie(res);

      const idToken = await getUiOidcIdToken(user.email);
      if (!idToken) {
        log.debug('OIDC logout: no ID token stored, redirecting directly', { email, returnTo });
        res.redirect(returnTo);
        return;
      }

      const oidcConfig = getOidcConfigFromEnv();
      const discovery = await fetchOidcDiscoveryDocument(oidcConfig);

      const endSessionEndpoint = discovery.end_session_endpoint || oidcConfig.endSessionEndpoint;
      if (!endSessionEndpoint) {
        log.debug('OIDC logout: no end_session_endpoint in discovery or config, redirecting directly', {
          email,
          returnTo,
        });
        res.redirect(returnTo);
        return;
      }

      log.info('OIDC logout: redirecting to upstream IDP end_session_endpoint', { email, returnTo });
      const logoutUrl = new URL(endSessionEndpoint);
      logoutUrl.searchParams.set('post_logout_redirect_uri', returnTo);
      logoutUrl.searchParams.set('id_token_hint', idToken);
      res.redirect(logoutUrl.toString());
    } catch (error) {
      logError(log, error, { context: 'OIDC logout' });
      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
      res.redirect(returnTo);
    }
  });

  return router;
}

type ResolveNextRoleParams = {
  jwtRole: string | null;
  restrictNoRole: boolean;
  cstarService: CstarService;
  ssoUserId: string;
  accessToken?: string;
};

export async function resolveNextRole(params: ResolveNextRoleParams): Promise<string> {
  const { jwtRole, restrictNoRole, cstarService, ssoUserId, accessToken } = params;

  if (!restrictNoRole) {
    return jwtRole || 'global:member';
  }

  if (jwtRole) {
    return jwtRole;
  }

  if (!accessToken || !cstarService.isConfigured()) {
    return '';
  }

  const hasManagedProjectRole = await hasCstarManagedProjectRoleInAnyTenant({ cstarService, ssoUserId, accessToken });
  if (hasManagedProjectRole) {
    log.info('Granting global:member based on CSTAR managed tenant project role', { ssoUserId });
    return 'global:member';
  }

  return '';
}

type HasCstarProjectRoleInAnyTenantParams = {
  cstarService: CstarService;
  ssoUserId: string;
  accessToken: string;
};

async function hasCstarManagedProjectRoleInAnyTenant(params: HasCstarProjectRoleInAnyTenantParams): Promise<boolean> {
  const { cstarService, ssoUserId, accessToken } = params;
  let tenants;

  try {
    tenants = await cstarService.getUserTenantsStrict({ ssoUserId, accessToken });
  } catch (error) {
    log.error('Failed to verify CSTAR tenant memberships during OIDC login', {
      ssoUserId,
      error: String(error),
    });
    throw new Error('Unable to verify CSTAR tenant roles during sign-in', { cause: error });
  }

  for (const tenant of tenants) {
    let roles;

    try {
      roles = await cstarService.getUserSharedServiceRolesStrict({
        tenantId: tenant.id,
        ssoUserId,
        accessToken,
      });
    } catch (error) {
      log.error('Failed to verify CSTAR tenant shared-service roles during OIDC login', {
        ssoUserId,
        tenantId: tenant.id,
        error: String(error),
      });
      throw new Error('Unable to verify CSTAR tenant roles during sign-in', { cause: error });
    }

    if (roles.some((role) => isManagedProjectRole(role.name))) {
      return true;
    }
  }

  return false;
}

// --- Extracted helpers to reduce callback cognitive complexity ---

type CallbackValidationResult =
  | { redirect: string; code: null; statePayload: null; noncePayload: null }
  | {
      redirect: null;
      code: string;
      statePayload: N8nOidcStateCookiePayload;
      noncePayload: N8nOidcNonceCookiePayload | null;
    };

function validateCallbackRequest(req: Request, cookieSecret: string): CallbackValidationResult {
  const { code, state, error, error_description } = req.query;

  if (error) {
    log.error('OIDC error from provider', { error, errorDescription: error_description });
    return {
      redirect: buildExternalUiErrorRedirect(String(error_description || error)),
      code: null,
      statePayload: null,
      noncePayload: null,
    };
  }

  if (!code || !state) {
    return {
      redirect: buildExternalUiErrorRedirect('Missing authorization code or state'),
      code: null,
      statePayload: null,
      noncePayload: null,
    };
  }

  const stateCookie = req.cookies['n8n-oidc-state'];
  const nonceCookie = req.cookies['n8n-oidc-nonce'];

  if (!stateCookie || !nonceCookie) {
    return {
      redirect: buildExternalUiErrorRedirect('Missing state cookies - session expired'),
      code: null,
      statePayload: null,
      noncePayload: null,
    };
  }

  const statePayload = verifySignedCookie(stateCookie, cookieSecret) as N8nOidcStateCookiePayload | null;
  const noncePayload = verifySignedCookie(nonceCookie, cookieSecret) as N8nOidcNonceCookiePayload | null;

  if (!statePayload || statePayload.state !== state) {
    return {
      redirect: buildExternalUiErrorRedirect('Invalid state - possible CSRF attack'),
      code: null,
      statePayload: null,
      noncePayload: null,
    };
  }

  return { redirect: null, code: code as string, statePayload, noncePayload };
}

async function persistOidcTokens(
  email: string,
  tokens: { refresh_token?: string; id_token?: string; access_token?: string },
  accessTokenExpiresAt: number | undefined,
): Promise<void> {
  if (tokens.refresh_token) {
    await setUiOidcRefreshToken(email, tokens.refresh_token);
  }
  if (tokens.id_token) {
    await setUiOidcIdToken(email, tokens.id_token);
  }
  if (tokens.access_token) {
    await setUiOidcAccessTokenRecord(email, tokens.access_token, accessTokenExpiresAt);
  }
}

type HandleNewUserParams = {
  nextRole: string;
  identity: { email: string; subject?: string; name?: string; claims: Record<string, unknown> };
  oidcIdentity: UiOidcIdentity;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  userRepository: BuildOidcRouterParams['n8nRepositories']['user'];
  res: Response;
};

type HandleNewUserResult = { redirected: true; user: null } | { redirected: false; user: N8nUser | null };

async function handleNewUser(params: HandleNewUserParams): Promise<HandleNewUserResult> {
  const { nextRole, identity, oidcIdentity, accessToken, accessTokenExpiresAt, userRepository, res } = params;

  if (!nextRole) {
    log.info('No OIDC role for new user, redirecting to access request page without creating n8n user', {
      email: identity.email,
    });
    await redirectToAccessRequest({ user: null, identity: oidcIdentity, accessToken, accessTokenExpiresAt }, res);
    return { redirected: true, user: null };
  }

  const userCount = await userRepository.count();
  const resolvedRole = userCount === 0 ? 'global:owner' : nextRole;

  if (!resolvedRole) {
    return { redirected: false, user: null };
  }

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

  log.info('Created user with personal project', {
    role: resolvedRole,
    disabled: !nextRole,
    email: identity.email,
  });

  return { redirected: false, user: result.user };
}

async function syncUserRole(
  user: N8nUser,
  nextRole: string,
  userRepository: BuildOidcRouterParams['n8nRepositories']['user'],
  userSvc: UserService,
  email: string,
): Promise<void> {
  const currentRole = user.role?.slug || '';

  if (currentRole === nextRole) {
    return;
  }

  if (currentRole === 'global:owner' && nextRole !== 'global:owner') {
    const otherOwnerCount = await userRepository
      .createQueryBuilder('user')
      .innerJoin('user.role', 'role')
      .where('role.slug = :ownerRole', { ownerRole: 'global:owner' })
      .andWhere('user.id != :userId', { userId: user.id })
      .getCount();

    if (otherOwnerCount === 0) {
      log.warn('Not downgrading user role to avoid leaving system without an owner', { email });
      return;
    }
  }

  if (nextRole) {
    await userSvc.changeUserRole(user, { newRoleName: nextRole });
    log.info('User role updated', { previousRole: currentRole, newRole: nextRole, email });
  }
}
