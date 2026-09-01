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
  getUiSessionIssueId,
  deleteUiSessionIssueId,
  deleteUiSessionExchange,
  deleteUiOidcTokenRecords,
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
// Guaranteed atomicity scope ():
// - Failed login NEVER leaves a newly consumable exchange handle
//   (prepareUiSessionExchange failure or n8n-token failure cleans handle)
// - Failed login NEVER leaves a newly usable UI bearer that wasn't already
//   valid. Partial OIDC token writes (reftoken/idtoken/acctoken) are
//   overwrite-safe and cannot create a session without a valid sid match
//   (separate mode) or tokenemail record consumed via handle (raw mode);
//   logout (deleteUiOidcTokens) or next successful login overwrites them.
// - sid mutation (setUiSessionIssueId) is compensated: if handle or n8n
//   token fails after sid was overwritten, we restore the prior sid when
//   it existed (preserving prior session) or delete the new sid when
//   none existed (no prior session is kept). Prior session preservation
//   vs revocation is therefore explicit and tested; new-login vs re-login
//   differ only by whether a prior sid existed.
// - All cleanup is idempotent (DEL of missing key is no-op) and preserves
//   the original error when cleanup itself fails.
// No Redis transaction/Lua is used: operations are independent single-key
// SETs (atomic individually). Multi-key consistency relies on explicit
// compensating delete/restore, which the fake models accurately (see
// ui-oidc-store.ts header). Real-Redis integration would exercise
// GETDEL/DEL idempotency; unit tests with injected failures cover the
// compensation.
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
  try {
    await Promise.all(ops);
  } catch (orig: unknown) {
    // Best-effort compensating delete of any token keys that may have
    // been partially written. This is idempotent (DEL of missing keys)
    // and must not mask the original error.
    try {
      await deleteUiOidcTokenRecords(email);
    } catch {
      // preserve original error even if cleanup fails
    }
    throw orig;
  }
}

// ---------------------------------------------------------------------------
// Prepare UI exchange – atomic UI session handle (single-use)
// Guarantees (): no failed login leaves a consumable handle.
// sid mutation is compensated so prior session is preserved when it
// existed (see coordinator handleCallback for priorSid restore) or
// revoked (new sid deleted) when this is a first login. Cleanup is
// idempotent and preserves original error.
// ---------------------------------------------------------------------------
export type PrepareUiExchangeDeps = {
  issueToken?: typeof issueUiSessionToken;
  setIssueId?: typeof setUiSessionIssueId;
  setExchange?: typeof setUiSessionExchange;
  getIssueId?: typeof getUiSessionIssueId;
  deleteIssueId?: typeof deleteUiSessionIssueId;
  deleteExchange?: typeof deleteUiSessionExchange;
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
  const getIssue = deps.getIssueId ?? getUiSessionIssueId;
  const delIssue = deps.deleteIssueId ?? deleteUiSessionIssueId;

  const sessionId = crypto.randomBytes(16).toString('base64url');
  const uiToken = await issue({
    oidc: identity,
    upstreamAccessToken: accessToken,
    upstreamExpiresAt: accessTokenExpiresAt,
    sessionId,
  });
  // Capture prior sid for compensating restore if later step fails.
  let priorSid: string | null;
  try {
    priorSid = await getIssue(identity.email);
  } catch {
    priorSid = null;
  }
  await setIssue(identity.email, sessionId);
  const handle = crypto.randomBytes(24).toString('base64url');
  try {
    await setEx(handle, uiToken, UI_SESSION_EXCHANGE_TTL_MS);
  } catch (orig: unknown) {
    // Compensating: restore prior sid or delete newly written sid.
    // Idempotent; preserve original error even if cleanup fails.
    try {
      if (priorSid) {
        await setIssue(identity.email, priorSid);
      } else {
        await delIssue(identity.email);
      }
    } catch {
      // ignore cleanup failure – original error is authoritative
    }
    throw orig;
  }
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

type OidcAuthorizationCompletion = Awaited<ReturnType<typeof completeOidcAuthorization>>;

type AuthenticatedOidcIdentity = ReturnType<typeof extractOidcIdentity> & { email: string };

type AuthenticatedLogin = {
  completion: OidcAuthorizationCompletion;
  identity: AuthenticatedOidcIdentity;
  oidcIdentity: UiOidcIdentity;
  accessTokenExpiresAt: number | undefined;
};

type RoleResolution = {
  jwtRole: string | null;
  cstarSsoUserId: string;
  nextRole: string;
  eligibilityTenants: import('../types/cstar').CstarTenant[] | undefined;
};

export function isFailureOutcome<T>(result: T | OidcLoginFailureOutcome): result is OidcLoginFailureOutcome {
  return typeof result === 'object' && result !== null && 'kind' in result && result.kind === 'failure';
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
  // Atomic helpers for compensating sid cleanup ()
  getSessionIssueId?: typeof getUiSessionIssueId;
  setSessionIssueId?: typeof setUiSessionIssueId;
  deleteSessionIssueId?: typeof deleteUiSessionIssueId;
  deleteSessionExchange?: typeof deleteUiSessionExchange;
  runPostLoginWork?: typeof import('./post-login-tenant').runPostLoginTenantWork;
  logger?: ReturnType<typeof createLogger>;
};

export type OidcLoginInput = {
  code: string;
  statePayload: N8nOidcStateCookiePayload;
  noncePayload: N8nOidcNonceCookiePayload;
};

const ALLOWED_PUBLIC_ERROR_MESSAGES: readonly string[] = [
  'No valid email in OIDC response',
  'Missing ID token in token response',
  'OIDC JWKS URI is not configured',
  'OIDC issuer is required in manual endpoint mode',
  'OIDC issuer is not configured',
  'OIDC discovery issuer mismatch',
  'Invalid issuer',
  'Invalid nonce',
  'Invalid ID token: missing sub',
  'userinfo sub mismatch',
  'Unable to verify CSTAR tenant roles during sign-in',
  'OIDC provider did not return an access token',
  'Failed to create or find user',
  'Missing authorization code or state',
  'Invalid state - possible CSRF attack',
  'Missing state cookies - session expired',
  'Missing or invalid nonce - session expired',
];

const INVALID_ISSUER_MESSAGES = new Set([
  'OIDC discovery issuer mismatch',
  'OIDC issuer is required in manual endpoint mode',
  'OIDC issuer is not configured',
]);

function formatAllowedPublicMessage(message: string): string {
  if (INVALID_ISSUER_MESSAGES.has(message)) return 'Authentication failed: Invalid issuer';

  if (message.startsWith('Missing') || message.startsWith('Invalid state')) return message;

  return message.includes('Authentication failed') ? message : 'Authentication failed: ' + message;
}

function isIssuerConfigurationError(message: string): boolean {
  return (
    message.includes('OIDC discovery issuer mismatch') ||
    /discovery issuer mismatch/i.test(message) ||
    /OIDC issuer is required/i.test(message) ||
    /OIDC issuer is not configured/i.test(message)
  );
}

function toPublicMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  // Map known stable messages to a sanitized allowlist; never expose raw provider
  // descriptions, token details, URLs with secrets, or infrastructure stack traces.
  // Detailed cause is already logged server-side via logError at the call site.
  const allowed = ALLOWED_PUBLIC_ERROR_MESSAGES.find((message) => msg.includes(message));
  if (allowed) return formatAllowedPublicMessage(allowed);

  // Explicit generic fallbacks for infrastructure/provider failures that must not leak
  if (isIssuerConfigurationError(msg)) return 'Authentication failed: Invalid issuer';

  // Unknown provider, Redis, database, coding errors -> stable generic public response
  return 'Authentication failed';
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
      getSessionIssueId: getUiSessionIssueId,
      setSessionIssueId: setUiSessionIssueId,
      deleteSessionIssueId: deleteUiSessionIssueId,
      deleteSessionExchange: deleteUiSessionExchange,
      runPostLoginWork: runPostLoginTenantWork,
      logger: log,
      ...deps,
    } as Required<OidcLoginCoordinatorDeps>;
  }

  async handleCallback(input: OidcLoginInput): Promise<OidcLoginOutcome> {
    const authenticated = await this.authenticate(input);
    if (isFailureOutcome(authenticated)) return authenticated;

    const role = await this.resolveRole(authenticated);
    if (isFailureOutcome(role)) return role;

    let user = await this.findUser(authenticated.identity.email);
    if (isFailureOutcome(user)) return user;

    if (!user && !role.nextRole) {
      this.deps.logger.info('No OIDC role for new user, redirecting to access request page without creating n8n user', {
        email: authenticated.identity.email,
      });
      return this.createAccessRequest(authenticated, 'new ineligible');
    }

    if (!user) {
      user = await this.provisionUser(authenticated, role.nextRole);
      if (isFailureOutcome(user)) return user;
    }

    const userUpdate = await this.syncAndUpdateUser(user, role.nextRole, authenticated.identity.email);
    if (isFailureOutcome(userUpdate)) return userUpdate;
    if (!role.nextRole) return this.createAccessRequest(authenticated, 'existing ineligible');

    await this.runPostLoginWork(authenticated, role, user);
    return this.createEligibleSession(authenticated, user, input.statePayload);
  }

  private async authenticate(input: OidcLoginInput): Promise<AuthenticatedLogin | OidcLoginFailureOutcome> {
    const { config, completeAuthorization, extractIdentity, persistTokens, logger } = this.deps;
    let completion: OidcAuthorizationCompletion;
    try {
      completion = await completeAuthorization({
        code: input.code,
        storedState: {
          nonce: input.noncePayload.nonce!,
          codeVerifier: input.statePayload?.codeVerifier,
          redirectUri: input.statePayload?.redirectUri || config.redirectUri,
        },
        config,
      });
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - provider completion' });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }

    let identity: ReturnType<typeof extractIdentity>;
    try {
      identity = extractIdentity({ claims: completion.mergedClaims, discovery: completion.discovery, config });
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - extract identity' });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }
    if (!identity.email || !isValidEmail(identity.email))
      return { kind: 'failure', publicMessage: 'No valid email in OIDC response' };

    const accessTokenExpiresAt = resolveAccessTokenExpiresAt(completion.tokens.expires_in);
    try {
      await persistTokens(identity.email, completion.tokens, accessTokenExpiresAt);
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - persist tokens' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
    return {
      completion,
      identity: identity as AuthenticatedOidcIdentity,
      accessTokenExpiresAt,
      oidcIdentity: {
        subject: identity.subject || identity.email,
        email: identity.email,
        preferredUsername: identity.preferredUsername,
        name: identity.name,
        issuer: completion.discovery.issuer || config.issuerUrl,
        audience: [config.clientId],
        claims: identity.claims,
      },
    };
  }

  private async resolveRole(login: AuthenticatedLogin): Promise<RoleResolution | OidcLoginFailureOutcome> {
    const { config, cstarService, resolveCstarSsoUserId, resolveNextRole, logger } = this.deps;
    const jwtRole = parseN8nOidcRole(login.identity.claims[config.rolesClaim]);
    const cstarSsoUserId = resolveCstarSsoUserId(login.identity.claims, login.identity.subject, login.identity.email);
    const eligibilityTenants = await this.fetchEligibilityTenants(login, jwtRole, cstarSsoUserId);
    if (isFailureOutcome(eligibilityTenants)) return eligibilityTenants;
    try {
      const nextRole = await resolveNextRole({
        jwtRole,
        restrictNoRole: config.restrictNoRole,
        cstarService,
        ssoUserId: cstarSsoUserId,
        accessToken: login.completion.tokens.access_token,
        tenants: eligibilityTenants,
      });
      return { jwtRole, cstarSsoUserId, nextRole, eligibilityTenants };
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - resolve role' });
      const message = error instanceof Error ? error.message : String(error);
      return {
        kind: 'failure',
        publicMessage: message.includes('Unable to verify CSTAR') ? message : toPublicMessage(error),
      };
    }
  }

  private async fetchEligibilityTenants(
    login: AuthenticatedLogin,
    jwtRole: string | null,
    cstarSsoUserId: string,
  ): Promise<import('../types/cstar').CstarTenant[] | undefined | OidcLoginFailureOutcome> {
    const { config, cstarService, logger } = this.deps;
    const accessToken = login.completion.tokens.access_token;
    if (!config.restrictNoRole || jwtRole || !accessToken || !cstarService.isConfigured()) return undefined;
    try {
      return await cstarService.getUserTenantsStrict({ ssoUserId: cstarSsoUserId, accessToken });
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - resolve role (tenants fetch)' });
      const message = error instanceof Error ? error.message : String(error);
      return {
        kind: 'failure',
        publicMessage: message.includes('Unable to verify CSTAR')
          ? message
          : 'Unable to verify CSTAR tenant roles during sign-in',
      };
    }
  }

  private async findUser(email: string): Promise<N8nUser | null | OidcLoginFailureOutcome> {
    try {
      return (await this.deps.userRepository.findByEmail(email, ['role'])) as N8nUser | null;
    } catch (error) {
      logError(this.deps.logger, error, { context: 'OIDC callback - find user' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
  }

  private async provisionUser(login: AuthenticatedLogin, nextRole: string): Promise<N8nUser | OidcLoginFailureOutcome> {
    const { userRepository, logger } = this.deps;
    let resolvedRole: string;
    try {
      resolvedRole = (await userRepository.count()) === 0 ? 'global:owner' : nextRole;
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - count users' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
    if (!resolvedRole) return { kind: 'failure', publicMessage: 'Failed to create or find user' };

    const { identity } = login;
    const givenName = typeof identity.claims.given_name === 'string' ? identity.claims.given_name : undefined;
    const familyName = typeof identity.claims.family_name === 'string' ? identity.claims.family_name : undefined;
    try {
      const result = await userRepository.createUserWithProject({
        email: identity.email,
        firstName: givenName || identity.name?.split(' ')[0] || 'User',
        lastName: familyName || identity.name?.split(' ').slice(1).join(' ') || '',
        password: crypto.randomBytes(32).toString('hex'),
        disabled: !nextRole,
        role: { slug: resolvedRole },
      } as any);
      const user = result.user as N8nUser;
      logger.info('Created user with personal project', {
        role: resolvedRole,
        disabled: !nextRole,
        email: identity.email,
      });
      return user || { kind: 'failure', publicMessage: 'Failed to create or find user' };
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - create user' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
  }

  private async syncAndUpdateUser(
    user: N8nUser,
    nextRole: string,
    email: string,
  ): Promise<void | OidcLoginFailureOutcome> {
    const { userRepository, userService, logger } = this.deps;
    try {
      await syncN8nUserRole({ user, nextRole, userRepository, userService });
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - sync role' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
    if (!nextRole) return this.setUserDisabled(user, true, email);
    if ((user as any).disabled) return this.setUserDisabled(user, false, email);
  }

  private async setUserDisabled(
    user: N8nUser,
    disabled: boolean,
    email: string,
  ): Promise<void | OidcLoginFailureOutcome> {
    try {
      await this.deps.userRepository.setUserDisabled(user.id, disabled);
      user.disabled = disabled;
      this.deps.logger.info(
        disabled
          ? 'User disabled, redirecting to access request page'
          : 'User re-enabled after receiving a valid OIDC role',
        { email },
      );
    } catch (error) {
      logError(this.deps.logger, error, {
        context: disabled ? 'OIDC callback - disable user' : 'OIDC callback - re-enable user',
      });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
  }

  private async createAccessRequest(
    login: AuthenticatedLogin,
    userKind: 'new ineligible' | 'existing ineligible',
  ): Promise<OidcLoginAccessRequestOutcome | OidcLoginFailureOutcome> {
    try {
      const { handle, token } = await this.deps.prepareExchange(
        login.oidcIdentity,
        login.completion.tokens.access_token,
        login.accessTokenExpiresAt,
      );
      return {
        kind: 'access-request',
        uiHandle: handle,
        uiToken: token,
        redirectUrl: appendSessionToReturnTo(buildUiAppUrl('/access-request'), handle),
      };
    } catch (error) {
      logError(this.deps.logger, error, { context: `OIDC callback - prepare UI exchange (${userKind})` });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }
  }

  private async runPostLoginWork(login: AuthenticatedLogin, role: RoleResolution, user: N8nUser): Promise<void> {
    const {
      ensureTenantMapping,
      projectRepository,
      tenantProjectRelationRepository,
      tenantProjectSyncService,
      cstarService,
      logger,
    } = this.deps;
    try {
      await ensureTenantMapping({
        userId: user.id,
        projectRepo: projectRepository as any,
        tenantProjectRelationRepository,
        reason: 'oidc-login',
      });
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - ensure tenant mapping' });
    }

    const accessToken = login.completion.tokens.access_token;
    const tenantService = this.deps.tenantService;
    if (!accessToken) {
      logger.debug('Post-login tenant work skipped: no access token', { email: login.identity.email });
      return;
    }
    if (tenantService) {
      void this.deps
        .runPostLoginWork({
          email: login.identity.email,
          ssoUserId: role.cstarSsoUserId,
          accessToken,
          n8nUserId: user.id,
          tenantService,
          tenantProjectSyncService,
          cstarService,
          tenants: role.eligibilityTenants,
        })
        .catch((error: unknown) =>
          logger.error('Tenant post-login work failed', { email: login.identity.email, error: String(error) }),
        );
      return;
    }
    void tenantProjectSyncService
      .syncTenantsForUser({ ssoUserId: role.cstarSsoUserId, n8nUserId: user.id, accessToken })
      .catch((error: unknown) =>
        logger.error('Tenant project sync failed', { email: login.identity.email, error: String(error) }),
      );
  }

  private async createEligibleSession(
    login: AuthenticatedLogin,
    user: N8nUser,
    statePayload: N8nOidcStateCookiePayload,
  ): Promise<OidcLoginEligibleOutcome | OidcLoginFailureOutcome> {
    const { prepareExchange, createAuthTokenFn, jwtService, returnTargetPolicy, logger } = this.deps;
    const priorSid = await this.getPriorSessionIssueId(login.oidcIdentity.email);
    let exchange: { handle: string; token: string };
    try {
      exchange = await prepareExchange(
        login.oidcIdentity,
        login.completion.tokens.access_token,
        login.accessTokenExpiresAt,
      );
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - prepare UI exchange (eligible)' });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }
    try {
      const n8nAuthToken = createAuthTokenFn(user as any, jwtService);
      const returnTo =
        resolveReturnTarget(statePayload?.returnTo, 'login', returnTargetPolicy) ||
        appendQueryParam(buildUiAppUrl('/'), 'continue', '/');
      return {
        kind: 'eligible',
        user,
        n8nAuthToken,
        uiHandle: exchange.handle,
        uiToken: exchange.token,
        redirectUrl: appendSessionToReturnTo(returnTo, exchange.handle),
      };
    } catch (error) {
      logError(logger, error, { context: 'OIDC callback - create n8n auth token' });
      await this.cleanupFailedEligibleSession(exchange.handle, login.oidcIdentity.email, priorSid);
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
  }

  private async getPriorSessionIssueId(email: string): Promise<string | null> {
    try {
      return await this.deps.getSessionIssueId(email);
    } catch {
      return null;
    }
  }

  private async cleanupFailedEligibleSession(handle: string, email: string, priorSid: string | null): Promise<void> {
    try {
      await this.deps.consumeExchange(handle);
    } catch {
      try {
        await this.deps.deleteSessionExchange(handle);
      } catch {
        // Preserve the original token-creation failure.
      }
    }
    try {
      if (priorSid) await this.deps.setSessionIssueId(email, priorSid);
      else await this.deps.deleteSessionIssueId(email);
    } catch {
      // Preserve the original token-creation failure.
    }
  }
}

export function createOidcLoginCoordinator(deps: OidcLoginCoordinatorDeps): OidcLoginCoordinator {
  return new OidcLoginCoordinator(deps);
}
