'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.OidcLoginCoordinator = void 0;
exports.syncN8nUserRole = syncN8nUserRole;
exports.resolveNextRoleInternal = resolveNextRoleInternal;
exports.persistOidcTokensDefault = persistOidcTokensDefault;
exports.prepareUiSessionExchange = prepareUiSessionExchange;
exports.isFailureOutcome = isFailureOutcome;
exports.createOidcLoginCoordinator = createOidcLoginCoordinator;
const node_crypto_1 = __importDefault(require('node:crypto'));
const n8n_oidc_1 = require('../helpers/n8n-oidc');
const oidc_provider_1 = require('../helpers/oidc-provider');
const ui_auth_token_1 = require('../helpers/ui-auth-token');
const ui_oidc_store_1 = require('../helpers/ui-oidc-store');
const cstar_sso_user_id_1 = require('../helpers/cstar-sso-user-id');
const url_1 = require('../helpers/url');
const return_target_1 = require('../helpers/return-target');
const logger_1 = require('../utils/logger');
const personal_project_tenant_1 = require('../services/personal-project-tenant');
const post_login_tenant_1 = require('./post-login-tenant');
const log = (0, logger_1.createLogger)('OidcLoginCoordinator');
const UI_SESSION_EXCHANGE_TTL_MS = 60 * 1000;
// ---------------------------------------------------------------------------
// Domain ops – last-owner protection and role sync
// ---------------------------------------------------------------------------
async function syncN8nUserRole(params) {
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
    await userService.changeUserRole(user, { newRoleName: nextRole });
    log.info('User role updated', { previousRole: currentRole, newRole: nextRole, email: user.email });
  }
}
async function resolveNextRoleInternal(params) {
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
  const { isManagedProjectRole } = await Promise.resolve().then(() =>
    __importStar(require('../constants/project-roles')),
  );
  let tenants = preFetchedTenants;
  if (!tenants) {
    try {
      tenants = await cstarService.getUserTenantsStrict({ ssoUserId, accessToken: accessToken });
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
async function persistOidcTokensDefault(email, tokens, accessTokenExpiresAt) {
  const ops = [];
  if (tokens.refresh_token) {
    const refreshExpiresAt =
      typeof tokens.refresh_expires_in === 'number' ? Date.now() + tokens.refresh_expires_in * 1000 : undefined;
    ops.push((0, ui_oidc_store_1.setUiOidcRefreshTokenWithExpiry)(email, tokens.refresh_token, refreshExpiresAt));
  }
  if (tokens.id_token) {
    ops.push((0, ui_oidc_store_1.setUiOidcIdToken)(email, tokens.id_token));
  }
  if (tokens.access_token) {
    ops.push((0, ui_oidc_store_1.setUiOidcAccessTokenRecord)(email, tokens.access_token, accessTokenExpiresAt));
  }
  if (ops.length === 0) return;
  try {
    await Promise.all(ops);
  } catch (orig) {
    // Best-effort compensating delete of any token keys that may have
    // been partially written. This is idempotent (DEL of missing keys)
    // and must not mask the original error.
    try {
      await (0, ui_oidc_store_1.deleteUiOidcTokenRecords)(email);
    } catch {
      // preserve original error even if cleanup fails
    }
    throw orig;
  }
}
async function prepareUiSessionExchange(identity, accessToken, accessTokenExpiresAt, deps = {}) {
  const issue = deps.issueToken ?? ui_auth_token_1.issueUiSessionToken;
  const setIssue = deps.setIssueId ?? ui_oidc_store_1.setUiSessionIssueId;
  const setEx = deps.setExchange ?? ui_oidc_store_1.setUiSessionExchange;
  const getIssue = deps.getIssueId ?? ui_oidc_store_1.getUiSessionIssueId;
  const delIssue = deps.deleteIssueId ?? ui_oidc_store_1.deleteUiSessionIssueId;
  const sessionId = node_crypto_1.default.randomBytes(16).toString('base64url');
  const uiToken = await issue({
    oidc: identity,
    upstreamAccessToken: accessToken,
    upstreamExpiresAt: accessTokenExpiresAt,
    sessionId,
  });
  // Capture prior sid for compensating restore if later step fails.
  let priorSid;
  try {
    priorSid = await getIssue(identity.email);
  } catch {
    priorSid = null;
  }
  await setIssue(identity.email, sessionId);
  const handle = node_crypto_1.default.randomBytes(24).toString('base64url');
  try {
    await setEx(handle, uiToken, UI_SESSION_EXCHANGE_TTL_MS);
  } catch (orig) {
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
function isFailureOutcome(result) {
  return typeof result === 'object' && result !== null && 'kind' in result && result.kind === 'failure';
}
const ALLOWED_PUBLIC_ERROR_MESSAGES = [
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
function formatAllowedPublicMessage(message) {
  if (INVALID_ISSUER_MESSAGES.has(message)) return 'Authentication failed: Invalid issuer';
  if (message.startsWith('Missing') || message.startsWith('Invalid state')) return message;
  return message.includes('Authentication failed') ? message : 'Authentication failed: ' + message;
}
function isIssuerConfigurationError(message) {
  return (
    message.includes('OIDC discovery issuer mismatch') ||
    /discovery issuer mismatch/i.test(message) ||
    /OIDC issuer is required/i.test(message) ||
    /OIDC issuer is not configured/i.test(message)
  );
}
function toPublicMessage(error) {
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
class OidcLoginCoordinator {
  deps;
  constructor(deps) {
    this.deps = {
      completeAuthorization: oidc_provider_1.completeOidcAuthorization,
      extractIdentity: oidc_provider_1.extractOidcIdentity,
      resolveCstarSsoUserId: cstar_sso_user_id_1.resolveCstarSsoUserId,
      resolveNextRole: resolveNextRoleInternal,
      persistTokens: persistOidcTokensDefault,
      prepareExchange: prepareUiSessionExchange,
      ensureTenantMapping: personal_project_tenant_1.ensurePersonalProjectTenantMapping,
      createAuthTokenFn: n8n_oidc_1.createAuthToken,
      consumeExchange: ui_oidc_store_1.consumeUiSessionExchange,
      getSessionIssueId: ui_oidc_store_1.getUiSessionIssueId,
      setSessionIssueId: ui_oidc_store_1.setUiSessionIssueId,
      deleteSessionIssueId: ui_oidc_store_1.deleteUiSessionIssueId,
      deleteSessionExchange: ui_oidc_store_1.deleteUiSessionExchange,
      runPostLoginWork: post_login_tenant_1.runPostLoginTenantWork,
      logger: log,
      ...deps,
    };
  }
  async handleCallback(input) {
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
  async authenticate(input) {
    const { config, completeAuthorization, extractIdentity, persistTokens, logger } = this.deps;
    let completion;
    try {
      completion = await completeAuthorization({
        code: input.code,
        storedState: {
          nonce: input.noncePayload.nonce,
          codeVerifier: input.statePayload?.codeVerifier,
          redirectUri: input.statePayload?.redirectUri || config.redirectUri,
        },
        config,
      });
    } catch (error) {
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - provider completion' });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }
    let identity;
    try {
      identity = extractIdentity({ claims: completion.mergedClaims, discovery: completion.discovery, config });
    } catch (error) {
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - extract identity' });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }
    if (!identity.email || !(0, n8n_oidc_1.isValidEmail)(identity.email))
      return { kind: 'failure', publicMessage: 'No valid email in OIDC response' };
    const accessTokenExpiresAt = (0, ui_auth_token_1.resolveAccessTokenExpiresAt)(completion.tokens.expires_in);
    try {
      await persistTokens(identity.email, completion.tokens, accessTokenExpiresAt);
    } catch (error) {
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - persist tokens' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
    return {
      completion,
      identity: identity,
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
  async resolveRole(login) {
    const { config, cstarService, resolveCstarSsoUserId, resolveNextRole, logger } = this.deps;
    const jwtRole = (0, n8n_oidc_1.parseN8nOidcRole)(login.identity.claims[config.rolesClaim]);
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
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - resolve role' });
      const message = error instanceof Error ? error.message : String(error);
      return {
        kind: 'failure',
        publicMessage: message.includes('Unable to verify CSTAR') ? message : toPublicMessage(error),
      };
    }
  }
  async fetchEligibilityTenants(login, jwtRole, cstarSsoUserId) {
    const { config, cstarService, logger } = this.deps;
    const accessToken = login.completion.tokens.access_token;
    if (!config.restrictNoRole || jwtRole || !accessToken || !cstarService.isConfigured()) return undefined;
    try {
      return await cstarService.getUserTenantsStrict({ ssoUserId: cstarSsoUserId, accessToken });
    } catch (error) {
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - resolve role (tenants fetch)' });
      const message = error instanceof Error ? error.message : String(error);
      return {
        kind: 'failure',
        publicMessage: message.includes('Unable to verify CSTAR')
          ? message
          : 'Unable to verify CSTAR tenant roles during sign-in',
      };
    }
  }
  async findUser(email) {
    try {
      return await this.deps.userRepository.findByEmail(email, ['role']);
    } catch (error) {
      (0, logger_1.logError)(this.deps.logger, error, { context: 'OIDC callback - find user' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
  }
  async provisionUser(login, nextRole) {
    const { userRepository, logger } = this.deps;
    let resolvedRole;
    try {
      resolvedRole = (await userRepository.count()) === 0 ? 'global:owner' : nextRole;
    } catch (error) {
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - count users' });
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
        password: node_crypto_1.default.randomBytes(32).toString('hex'),
        disabled: !nextRole,
        role: { slug: resolvedRole },
      });
      const user = result.user;
      logger.info('Created user with personal project', {
        role: resolvedRole,
        disabled: !nextRole,
        email: identity.email,
      });
      return user || { kind: 'failure', publicMessage: 'Failed to create or find user' };
    } catch (error) {
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - create user' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
  }
  async syncAndUpdateUser(user, nextRole, email) {
    const { userRepository, userService, logger } = this.deps;
    try {
      await syncN8nUserRole({ user, nextRole, userRepository, userService });
    } catch (error) {
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - sync role' });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
    if (!nextRole) return this.setUserDisabled(user, true, email);
    if (user.disabled) return this.setUserDisabled(user, false, email);
  }
  async setUserDisabled(user, disabled, email) {
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
      (0, logger_1.logError)(this.deps.logger, error, {
        context: disabled ? 'OIDC callback - disable user' : 'OIDC callback - re-enable user',
      });
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
  }
  async createAccessRequest(login, userKind) {
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
        redirectUrl: (0, url_1.appendSessionToReturnTo)((0, url_1.buildUiAppUrl)('/access-request'), handle),
      };
    } catch (error) {
      (0, logger_1.logError)(this.deps.logger, error, { context: `OIDC callback - prepare UI exchange (${userKind})` });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }
  }
  async runPostLoginWork(login, role, user) {
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
        projectRepo: projectRepository,
        tenantProjectRelationRepository,
        reason: 'oidc-login',
      });
    } catch (error) {
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - ensure tenant mapping' });
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
        .catch((error) =>
          logger.error('Tenant post-login work failed', { email: login.identity.email, error: String(error) }),
        );
      return;
    }
    void tenantProjectSyncService
      .syncTenantsForUser({ ssoUserId: role.cstarSsoUserId, n8nUserId: user.id, accessToken })
      .catch((error) =>
        logger.error('Tenant project sync failed', { email: login.identity.email, error: String(error) }),
      );
  }
  async createEligibleSession(login, user, statePayload) {
    const { prepareExchange, createAuthTokenFn, jwtService, returnTargetPolicy, logger } = this.deps;
    const priorSid = await this.getPriorSessionIssueId(login.oidcIdentity.email);
    let exchange;
    try {
      exchange = await prepareExchange(
        login.oidcIdentity,
        login.completion.tokens.access_token,
        login.accessTokenExpiresAt,
      );
    } catch (error) {
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - prepare UI exchange (eligible)' });
      return { kind: 'failure', publicMessage: toPublicMessage(error) };
    }
    try {
      const n8nAuthToken = createAuthTokenFn(user, jwtService);
      const returnTo =
        (0, return_target_1.resolveReturnTarget)(statePayload?.returnTo, 'login', returnTargetPolicy) ||
        (0, url_1.appendQueryParam)((0, url_1.buildUiAppUrl)('/'), 'continue', '/');
      return {
        kind: 'eligible',
        user,
        n8nAuthToken,
        uiHandle: exchange.handle,
        uiToken: exchange.token,
        redirectUrl: (0, url_1.appendSessionToReturnTo)(returnTo, exchange.handle),
      };
    } catch (error) {
      (0, logger_1.logError)(logger, error, { context: 'OIDC callback - create n8n auth token' });
      await this.cleanupFailedEligibleSession(exchange.handle, login.oidcIdentity.email, priorSid);
      return { kind: 'failure', publicMessage: 'Authentication failed' };
    }
  }
  async getPriorSessionIssueId(email) {
    try {
      return await this.deps.getSessionIssueId(email);
    } catch {
      return null;
    }
  }
  async cleanupFailedEligibleSession(handle, email, priorSid) {
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
exports.OidcLoginCoordinator = OidcLoginCoordinator;
function createOidcLoginCoordinator(deps) {
  return new OidcLoginCoordinator(deps);
}
