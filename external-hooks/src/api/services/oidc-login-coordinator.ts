import crypto from 'node:crypto';
import type { N8nOidcConfig, N8nOidcStateCookiePayload, N8nOidcNonceCookiePayload } from '../helpers/n8n-oidc';
import { isValidEmail, parseN8nOidcRole, createAuthToken } from '../helpers/n8n-oidc';
import { completeOidcAuthorization, extractOidcIdentity } from '../helpers/oidc-provider';
import { issueUiSessionToken, resolveAccessTokenExpiresAt } from '../helpers/ui-auth-token';
import {
  setUiOidcAccessTokenRecord,
  setUiOidcIdToken,
  setUiOidcRefreshTokenWithExpiry,
  setUiSessionExchange,
  setUiSessionIssueId,
  consumeUiSessionExchange,
} from '../helpers/ui-oidc-store';
import { resolveCstarSsoUserId } from '../helpers/cstar-sso-user-id';
import type { UiOidcIdentity } from '../helpers/ui-oidc';
import { appendQueryParam, appendSessionToReturnTo, buildUiAppUrl } from '../helpers/url';
import { resolveReturnTarget, type ReturnTargetPolicy } from '../helpers/return-target';
import { createLogger, logError } from '../utils/logger';
import type { N8nUser } from '../types/user';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { JwtService } from '../services/jwt';
import type { UserService } from '../services/user';
import type { TenantProjectSyncService } from '../services/tenant-project-sync.service';
import type { CstarService } from '../services/cstar.service';
import { ensurePersonalProjectTenantMapping } from '../services/personal-project-tenant';
import { runPostLoginTenantWork } from './post-login-tenant';

const log = createLogger('OidcLoginCoordinator');
const UI_SESSION_EXCHANGE_TTL_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Domain ops – last-owner protection and role sync
// ---------------------------------------------------------------------------
export async function syncN8nUserRole(params: {
  user: N8nUser;
  nextRole: string;
  userRepository: N8nRepositories['user'];
  userService: UserService;
}): Promise<void> {
  const { user, nextRole, userRepository, userService } = params;
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
      log.warn('Not downgrading user role to avoid leaving system without an owner', { email: user.email });
      return;
    }
  }

  if (nextRole) {
    await userService.changeUserRole(user as any, { newRoleName: nextRole });
    log.info('User role updated', { previousRole: currentRole, newRole: nextRole, email: user.email });
  }
}

// ---------------------------------------------------------------------------
// Role resolver – shared for new and existing users
// ---------------------------------------------------------------------------
export type ResolveNextRoleParams = {
  jwtRole: string | null;
  restrictNoRole: boolean;
  cstarService: CstarService;
  ssoUserId: string;
  accessToken?: string;
  /** Optional pre-fetched tenants to avoid a duplicate CSTAR tenants call when caller already holds them */
  tenants?: import('../types/cstar').CstarTenant[];
};

export async function resolveNextRoleInternal(params: ResolveNextRoleParams): Promise<string> {
  const { jwtRole, restrictNoRole, cstarService, ssoUserId, accessToken, tenants: preFetchedTenants } = params;

  if (!restrictNoRole) {
    return jwtRole || 'global:member';
  }

  if (jwtRole) {
    return jwtRole;
  }

  if (!accessToken || !cstarService.isConfigured()) {
    return '';
  }

  // Delegated to CSTAR strict check – throws on verification failure
  // If tenants already fetched for this login (e.g., post-login reuse), avoid duplicate request.
  const { isManagedProjectRole } = await import('../constants/project-roles');
  let tenants = preFetchedTenants as import('../types/cstar').CstarTenant[] | undefined;
  if (!tenants) {
    try {
      tenants = await cstarService.getUserTenantsStrict({ ssoUserId, accessToken: accessToken! });
    } catch (error) {
      log.error('Failed to verify CSTAR tenant memberships during OIDC login', { ssoUserId, error: String(error) });
      throw new Error('Unable to verify CSTAR tenant roles during sign-in', { cause: error });
    }
  }

  for (const tenant of tenants) {
    let roles;
    try {
      roles = await cstarService.getUserSharedServiceRolesStrict({ tenantId: tenant.id, ssoUserId, accessToken });
    } catch (error) {
      log.error('Failed to verify CSTAR tenant shared-service roles during OIDC login', {
        ssoUserId,
        tenantId: tenant.id,
        error: String(error),
      });
      throw new Error('Unable to verify CSTAR tenant roles during sign-in', { cause: error });
    }

    if (roles.some((role) => isManagedProjectRole(role.name))) {
      log.info('Granting global:member based on CSTAR managed tenant project role', { ssoUserId });
      return 'global:member';
    }
  }

  return '';
}

// ---------------------------------------------------------------------------
// Persist tokens – extracted for injection/cleanup
// Failure semantics: each Redis write is independent. We batch with
// Promise.all() only after defining that any write failure aborts login
// with no session handle issued and leaves any partial token keys
// overwrite-safe (logout deletes all keys, and a missing exchange still
// blocks login). No Redis transaction is used because keys are
// independent and cleanup of partial writes is not required for
// correctness — the next successful login overwrites them and a
// failed login never issues a session. This is tested via persisted-
// token-failure cases.
// Token expiry: refresh_expires_in is preserved as expiresAt and
// the Redis TTL is capped to min(provider remaining, 30-day max).
// ---------------------------------------------------------------------------
export async function persistOidcTokensDefault(
  email: string,
  tokens: {
    refresh_token?: string;
    id_token?: string;
    access_token?: string;
    refresh_expires_in?: number;
    expires_in?: number;
  },
  accessTokenExpiresAt: number | undefined,
): Promise<void> {
  const ops: Promise<void>[] = [];

  if (tokens.refresh_token) {
    const refreshExpiresAt =
      typeof tokens.refresh_expires_in === 'number' ? Date.now() + tokens.refresh_expires_in * 1000 : undefined;
    ops.push(setUiOidcRefreshTokenWithExpiry(email, tokens.refresh_token, refreshExpiresAt));
  }
  if (tokens.id_token) {
    ops.push(setUiOidcIdToken(email, tokens.id_token));
  }
  if (tokens.access_token) {
    ops.push(setUiOidcAccessTokenRecord(email, tokens.access_token, accessTokenExpiresAt));
  }

  if (ops.length === 0) return;
  // Batch independent writes — any failure aborts the whole login (no partial session)
  await Promise.all(ops);
}

// ---------------------------------------------------------------------------
// Prepare UI exchange – atomic UI session handle (single-use)
// ---------------------------------------------------------------------------
export type PrepareUiExchangeDeps = {
  issueToken?: typeof issueUiSessionToken;
  setIssueId?: typeof setUiSessionIssueId;
  setExchange?: typeof setUiSessionExchange;
};

export async function prepareUiSessionExchange(
  identity: UiOidcIdentity,
  accessToken: string | undefined,
  accessTokenExpiresAt: number | undefined,
  deps: PrepareUiExchangeDeps = {},
): Promise<{ handle: string; token: string }> {
  const issue = deps.issueToken ?? issueUiSessionToken;
  const setIssue = deps.setIssueId ?? setUiSessionIssueId;
  const setEx = deps.setExchange ?? setUiSessionExchange;

  const sessionId = crypto.randomBytes(16).toString('base64url');
  const uiToken = await issue({
    oidc: identity,
    upstreamAccessToken: accessToken,
    upstreamExpiresAt: accessTokenExpiresAt,
    sessionId,
  });
  await setIssue(identity.email, sessionId);
  const handle = crypto.randomBytes(24).toString('base64url');
  await setEx(handle, uiToken, UI_SESSION_EXCHANGE_TTL_MS);
  return { handle, token: uiToken };
}

// ---------------------------------------------------------------------------
// Coordinator outcome types
// ---------------------------------------------------------------------------
export type OidcLoginEligibleOutcome = {
  kind: 'eligible';
  user: N8nUser;
  n8nAuthToken: string;
  uiHandle: string;
  uiToken: string;
  redirectUrl: string;
};

export type OidcLoginAccessRequestOutcome = {
  kind: 'access-request';
  uiHandle: string;
  uiToken: string;
  redirectUrl: string;
};

export type OidcLoginFailureOutcome = {
  kind: 'failure';
  publicMessage: string;
  statusCode?: number;
};

export type OidcLoginOutcome = OidcLoginEligibleOutcome | OidcLoginAccessRequestOutcome | OidcLoginFailureOutcome;

export function isFailureOutcome(o: OidcLoginOutcome): o is OidcLoginFailureOutcome {
  return o.kind === 'failure';
}

// ---------------------------------------------------------------------------
// Coordinator deps – all side-effects injected
// ---------------------------------------------------------------------------
export type OidcLoginCoordinatorDeps = {
  config: N8nOidcConfig;
  returnTargetPolicy: ReturnTargetPolicy;
  userRepository: N8nRepositories['user'];
  projectRepository: N8nRepositories['project'];
  tenantProjectRelationRepository: CustomRepositories['tenantProjectRelation'];
  jwtService: JwtService;
  userService: UserService;
  tenantProjectSyncService: TenantProjectSyncService;
  cstarService: CstarService;
  tenantService?: import('./tenant.service').TenantService;
  // ops – default to real helpers but swappable in tests
  completeAuthorization?: typeof completeOidcAuthorization;
  extractIdentity?: typeof extractOidcIdentity;
  resolveCstarSsoUserId?: typeof resolveCstarSsoUserId;
  resolveNextRole?: typeof resolveNextRoleInternal;
  persistTokens?: typeof persistOidcTokensDefault;
  prepareExchange?: typeof prepareUiSessionExchange;
  ensureTenantMapping?: typeof ensurePersonalProjectTenantMapping;
  createAuthTokenFn?: typeof createAuthToken;
  // Cleanup for atomicity: if UI handle created but n8n token fails, delete exchange
  consumeExchange?: typeof consumeUiSessionExchange;
  runPostLoginWork?: typeof import('./post-login-tenant').runPostLoginTenantWork;
  logger?: ReturnType<typeof createLogger>;
};

export type OidcLoginInput = {
  code: string;
  statePayload: N8nOidcStateCookiePayload;
  noncePayload: N8nOidcNonceCookiePayload;
};

function toPublicMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  // Known stable messages – expose directly; otherwise generic
  const stableFragments = [
    'No valid email',
    'Missing ID token',
    'OIDC JWKS URI',
    'Invalid issuer',
    'Invalid nonce',
    'Invalid ID token',
    'userinfo sub mismatch',
    'Unable to verify CSTAR',
    'OIDC provider did not return an access token',
    'Failed to create or find user',
    'Failed to create UI session',
    'Missing authorization code',
    'Invalid state',
  ];
  if (stableFragments.some((f) => msg.includes(f))) {
    return msg.includes('Authentication failed') ? msg : 'Authentication failed: ' + msg;
  }
  // For infrastructure failures (Redis, network) return generic but log details
  if (/redis/i.test(msg) || /UI session/i.test(msg) || /Failed to create UI/i.test(msg)) {
    return 'Authentication failed';
  }
  return 'Authentication failed: ' + msg;
}

export class OidcLoginCoordinator {
  private readonly deps: Required<OidcLoginCoordinatorDeps>;

  constructor(deps: OidcLoginCoordinatorDeps) {
    this.deps = {
      completeAuthorization: completeOidcAuthorization,
      extractIdentity: extractOidcIdentity,
      resolveCstarSsoUserId,
      resolveNextRole: resolveNextRoleInternal,
      persistTokens: persistOidcTokensDefault,
      prepareExchange: prepareUiSessionExchange,
      ensureTenantMapping: ensurePersonalProjectTenantMapping,
      createAuthTokenFn: createAuthToken,
      consumeExchange: consumeUiSessionExchange,
      runPostLoginWork: runPostLoginTenantWork,
      logger: log,
      ...deps,
    } as Required<OidcLoginCoordinatorDeps>;
  }

  async handleCallback(input: OidcLoginInput): Promise<OidcLoginOutcome> {
    const {
      config,
      returnTargetPolicy,
      userRepository,
      projectRepository,
      tenantProjectRelationRepository,
      jwtService,
      userService,
      tenantProjectSyncService,
      cstarService,
      completeAuthorization,
      extractIdentity,
      resolveCstarSsoUserId: resolveSso,
      resolveNextRole: resolveRole,
      persistTokens,
      prepareExchange,
      ensureTenantMapping,
      createAuthTokenFn,
      logger,
    } = this.deps;

    const { code, statePayload, noncePayload } = input;

    let completion: Awaited<ReturnType<typeof completeOidcAuthorization>>;
    try {
      completion = await completeAuthorization({
        code,
        storedState: {
          nonce: noncePayload.nonce!,
          codeVerifier: statePayload?.codeVerifier,
          redirectUri: statePayload?.redirectUri || config.redirectUri,
        },
        config,
      });
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - provider completion' });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }

    let identity: ReturnType<typeof extractIdentity>;
    try {
      identity = extractIdentity({
        claims: completion.mergedClaims,
        discovery: completion.discovery,
        config,
      });
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - extract identity' });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }

    if (!identity.email || !isValidEmail(identity.email)) {
      return { kind: 'failure', publicMessage: 'No valid email in OIDC response' };
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

    try {
      await persistTokens(identity.email, completion.tokens, accessTokenExpiresAt);
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - persist tokens' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }

    const jwtRole = parseN8nOidcRole(identity.claims[config.rolesClaim]);
    const cstarSsoUserId = resolveSso(identity.claims, identity.subject, identity.email);
    let nextRole: string;
    let eligibilityTenants: import('../types/cstar').CstarTenant[] | undefined;
    try {
      // Reuse CSTAR tenants fetch between eligibility check and post-login work
      // to avoid repeated getUserTenants calls in the same login (see post-login-tenant.ts).
      // When restrictNoRole + missing jwtRole requires CSTAR, pre-fetch strictly once and
      // pass through to resolver; otherwise resolver handles its own early returns without CSTAR.
      const needsCstarForEligibility =
        config.restrictNoRole && !jwtRole && !!completion.tokens.access_token && cstarService.isConfigured();
      if (needsCstarForEligibility) {
        try {
          eligibilityTenants = await cstarService.getUserTenantsStrict({
            ssoUserId: cstarSsoUserId,
            accessToken: completion.tokens.access_token!,
          });
        } catch (error) {
          logError(logger, error, { context: 'OIDC callback - resolve role (tenants fetch)' });
          const msg = error instanceof Error ? error.message : String(error);
          // Strict variant already throws stable message; preserve it
          const stable = msg.includes('Unable to verify CSTAR')
            ? msg
            : 'Unable to verify CSTAR tenant roles during sign-in';
          return { kind: 'failure', publicMessage: stable };
        }
        nextRole = await resolveRole({
          jwtRole,
          restrictNoRole: config.restrictNoRole,
          cstarService,
          ssoUserId: cstarSsoUserId,
          accessToken: completion.tokens.access_token,
          tenants: eligibilityTenants,
        });
      } else {
        nextRole = await resolveRole({
          jwtRole,
          restrictNoRole: config.restrictNoRole,
          cstarService,
          ssoUserId: cstarSsoUserId,
          accessToken: completion.tokens.access_token,
        });
      }
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - resolve role' });
      const msg = error instanceof Error ? error.message : String(error);
      // Preserve known stable message for CSTAR verification failure
      if (msg.includes('Unable to verify CSTAR')) {
        return { kind: 'failure', publicMessage: msg };
      }
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }

    // --- New user path (authoritative eligibility check) ---
    // eslint-disable-next-line
    let user: N8nUser | null = null;
    try {
      user = (await userRepository.findByEmail(identity.email, ['role'])) as N8nUser | null;
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - find user' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }

    if (!user) {
      if (!nextRole) {
        // Ineligible new user – UI-only session (access-request)
        logger.info('No OIDC role for new user, redirecting to access request page without creating n8n user', {
          email: identity.email,
        });
        try {
          const { handle, token } = await prepareExchange(
            oidcIdentity,
            completion.tokens.access_token,
            accessTokenExpiresAt,
          );
          const redirectUrl = appendSessionToReturnTo(buildUiAppUrl('/access-request'), handle);
          return { kind: 'access-request', uiHandle: handle, uiToken: token, redirectUrl };
        } catch (error) {
          logError(logger, error, { context: 'OIDC callback - prepare UI exchange (new ineligible)' });
          return { kind: 'failure', publicMessage: toPublicMessage(error) };
        }
      }

      // Eligible new user – provisioning
      let resolvedRole: string;
      try {
        const userCount = await userRepository.count();
        resolvedRole = userCount === 0 ? 'global:owner' : nextRole;
      } catch (error) {
        logError(logger, error, { context: 'OIDC callback - count users' });
        return { kind: 'failure', publicMessage: 'Authentication failed' };
      }

      if (!resolvedRole) {
        return { kind: 'failure', publicMessage: 'Failed to create or find user' };
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

      try {
        const result = await userRepository.createUserWithProject(userData as any);
        user = result.user as N8nUser;
        logger.info('Created user with personal project', {
          role: resolvedRole,
          disabled: !nextRole,
          email: identity.email,
        });
      } catch (error) {
        logError(logger, error, { context: 'OIDC callback - create user' });
        return { kind: 'failure', publicMessage: 'Authentication failed' };
      }

      if (!user) {
        return { kind: 'failure', publicMessage: 'Failed to create or find user' };
      }
    }

    // --- Existing user: role sync with last-owner protection ---
    if (user) {
      try {
        await syncN8nUserRole({ user, nextRole, userRepository, userService });
        // Refresh currentRole after sync? sync may have changed DB but user object still holds old role.
        // For decision below we use nextRole directly, not currentRole.
      } catch (error) {
        logError(logger, error, { context: 'OIDC callback - sync role' });
        return { kind: 'failure', publicMessage: 'Authentication failed' };
      }
    }

    if (!user) {
      return { kind: 'failure', publicMessage: 'Failed to create or find user' };
    }

    // --- Ineligible existing user – disable and UI-only ---
    if (!nextRole) {
      try {
        await userRepository.setUserDisabled(user.id, true);
      } catch (error) {
        logError(logger, error, { context: 'OIDC callback - disable user' });
        return { kind: 'failure', publicMessage: 'Authentication failed' };
      }
      user.disabled = true;
      logger.info('User disabled, redirecting to access request page', { email: identity.email });

      try {
        const { handle, token } = await prepareExchange(
          oidcIdentity,
          completion.tokens.access_token,
          accessTokenExpiresAt,
        );
        const redirectUrl = appendSessionToReturnTo(buildUiAppUrl('/access-request'), handle);
        return { kind: 'access-request', uiHandle: handle, uiToken: token, redirectUrl };
      } catch (error) {
        logError(logger, error, { context: 'OIDC callback - prepare UI exchange (existing ineligible)' });
        return { kind: 'failure', publicMessage: toPublicMessage(error) };
      }
    }

    // --- Re-enable if previously disabled ---
    if ((user as any).disabled) {
      try {
        await userRepository.setUserDisabled(user.id, false);
      } catch (error) {
        logError(logger, error, { context: 'OIDC callback - re-enable user' });
        return { kind: 'failure', publicMessage: 'Authentication failed' };
      }
      (user as any).disabled = false;
      logger.info('User re-enabled after receiving a valid OIDC role', { email: identity.email });
    }

    // --- Post-login: ensure tenant mapping (non-fatal) ---
    try {
      await ensureTenantMapping({
        userId: user.id,
        projectRepo: projectRepository as any,
        tenantProjectRelationRepository,
        reason: 'oidc-login',
      });
    } catch (error) {
      // Logged inside ensurePersonalProjectTenantMapping, but keep warning here
      logError(logger, error, { context: 'OIDC callback - ensure tenant mapping' });
    }

    // --- Post-login: unified tenant pre-warm + tenant-project sync ---
    // Single operation for eligible users only. Access-request-only users
    // intentionally do NOT pre-warm tenant caches (they have no n8n project
    // membership; first UI session will fetch on demand if needed). This
    // boundary is tested in coordinator tests.
    // Missing access_token is a no-op (logged, not failed) — login still
    // succeeds but tenant work is skipped.
    // Failures are non-blocking: logged with consistent shape, never
    // throw, preserving the documented login-success contract.
    // CSTAR tenants are fetched once and reused for both pre-warm and sync
    // to avoid repeated requests during the same login (see post-login-tenant.ts).
    const postLoginAccessToken = completion.tokens.access_token;
    const depsAny = this.deps as unknown as { tenantService?: import('./tenant.service').TenantService };
    if (depsAny.tenantService && this.deps.runPostLoginWork && postLoginAccessToken) {
      // Fire-and-forget with consistent error logging inside helper (allSettled)
      // Reuse eligibility tenants when available to avoid a duplicate CSTAR fetch
      void this.deps
        .runPostLoginWork({
          email: identity.email,
          ssoUserId: cstarSsoUserId,
          accessToken: postLoginAccessToken,
          n8nUserId: user.id,
          tenantService: depsAny.tenantService,
          tenantProjectSyncService,
          cstarService,
          tenants: eligibilityTenants,
        })
        .catch((err: unknown) => {
          // Defensive: runPostLoginWork already logs via allSettled, but keep outer catch for unexpected throw
          logger.error('Tenant post-login work failed', { email: identity.email, error: String(err) });
        });
    } else if (postLoginAccessToken) {
      // Fallback when tenantService not injected (e.g., legacy tests) — preserve old sync-only behavior
      tenantProjectSyncService
        .syncTenantsForUser({
          ssoUserId: cstarSsoUserId,
          n8nUserId: user.id,
          accessToken: postLoginAccessToken,
        })
        .catch((err: unknown) => {
          logger.error('Tenant project sync failed', { email: identity.email, error: String(err) });
        });
    } else {
      logger.debug('Post-login tenant work skipped: no access token', { email: identity.email });
    }

    // --- Session atomicity: prepare UI exchange BEFORE issuing n8n-auth ---
    let uiHandle: string;
    let uiToken: string;
    try {
      const res = await prepareExchange(oidcIdentity, completion.tokens.access_token, accessTokenExpiresAt);
      uiHandle = res.handle;
      uiToken = res.token;
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - prepare UI exchange (eligible)' });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }

    let n8nAuthToken: string;
    try {
      n8nAuthToken = createAuthTokenFn(user as any, jwtService);
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - create n8n auth token' });
      // Clean up the UI exchange we just created to avoid dangling single-use handle
      try {
        await this.deps.consumeExchange(uiHandle);
      } catch {
        // ignore cleanup failure – already logging original error
      }
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }

    const returnTo =
      resolveReturnTarget(statePayload?.returnTo, 'login', returnTargetPolicy) ||
      appendQueryParam(buildUiAppUrl('/'), 'continue', '/');

    const redirectUrl = appendSessionToReturnTo(returnTo, uiHandle);

    return { kind: 'eligible', user, n8nAuthToken, uiHandle, uiToken, redirectUrl };
  }
}

export function createOidcLoginCoordinator(deps: OidcLoginCoordinatorDeps): OidcLoginCoordinator {
  return new OidcLoginCoordinator(deps);
}
