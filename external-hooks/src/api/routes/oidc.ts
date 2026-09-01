import { Router, type Request, type Response } from 'express';
import { beginOidcAuthorization, fetchOidcDiscoveryDocument } from '../helpers/oidc-provider';
import { getSecureCookieFlag, getCookieOptions, getAuthCookieOptions } from '../helpers/cookie';
import { consumeUiLogoutHandle, getUiOidcIdToken, deleteUiOidcTokens } from '../helpers/ui-oidc-store';
import {
  createSignedCookie,
  getCookieSecret,
  type N8nOidcConfig,
  type N8nOidcNonceCookiePayload,
  type N8nOidcStateCookiePayload,
  verifySignedCookie,
} from '../helpers/n8n-oidc';
import { appendQueryParam } from '../helpers/url';
import { createReturnTargetPolicy, resolveReturnTarget } from '../helpers/return-target';
import { createLogger, logError } from '../utils/logger';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { AuthService } from '../services/auth';
import type { CstarService } from '../services/cstar.service';
import type { JwtService } from '../services/jwt';
import type { TenantProjectSyncService } from '../services/tenant-project-sync.service';
import type { TenantService } from '../services/tenant.service';
import type { UserService } from '../services/user';
import { createOidcLoginCoordinator, resolveNextRoleInternal } from '../services/oidc-login-coordinator';

const log = createLogger('OIDCHook');

// Public error boundary — allowlist of stable public codes/messages.
// Detailed causes are logged server-side; redirects never carry provider
// descriptions, token details, URLs with secrets, or raw infrastructure text.
const ALLOWED_OIDC_PROVIDER_ERROR_CODES = new Set([
  'invalid_request',
  'unauthorized_client',
  'access_denied',
  'unsupported_response_type',
  'invalid_scope',
  'server_error',
  'temporarily_unavailable',
  'interaction_required',
  'login_required',
  'account_selection_required',
  'consent_required',
  'invalid_request_uri',
  'invalid_request_object',
  'request_not_supported',
  'request_uri_not_supported',
  'registration_not_supported',
]);

const STABLE_PUBLIC_ROUTE_MESSAGES = new Set([
  'Missing authorization code or state',
  'Missing state cookies - session expired',
  'Invalid state - possible CSRF attack',
  'Missing or invalid nonce - session expired',
  'OIDC authorization endpoint is not configured',
  'OIDC issuer is required in manual endpoint mode',
  'OIDC issuer is not configured',
  'Authentication failed',
]);

function toPublicRouteMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (STABLE_PUBLIC_ROUTE_MESSAGES.has(raw)) return raw;
  for (const allowed of STABLE_PUBLIC_ROUTE_MESSAGES) {
    if (raw.includes(allowed)) return allowed;
  }
  // Map issuer-related failures to generic invalid-issuer public code
  if (
    /OIDC issuer is required/i.test(raw) ||
    /OIDC issuer is not configured/i.test(raw) ||
    /discovery issuer mismatch/i.test(raw)
  ) {
    return 'Authentication failed';
  }
  return 'Authentication failed';
}

function toPublicProviderErrorCode(errorParam: unknown): string {
  const raw = String(errorParam);
  if (ALLOWED_OIDC_PROVIDER_ERROR_CODES.has(raw)) return raw;
  return 'Authentication failed';
}

export type BuildOidcRouterParams = {
  n8nRepositories: N8nRepositories;
  customRepositories: CustomRepositories;
  authService: AuthService;
  jwtService: JwtService;
  userService: UserService;
  tenantProjectSyncService: TenantProjectSyncService;
  tenantService?: TenantService;
  cstarService: CstarService;
  config: N8nOidcConfig;
};

export function buildExternalUiErrorRedirect(message: string) {
  return '/ui?error=' + encodeURIComponent(message);
}

export function buildOidcRouter({
  n8nRepositories,
  customRepositories,
  authService,
  jwtService,
  userService,
  tenantProjectSyncService,
  tenantService,
  cstarService,
  config,
}: BuildOidcRouterParams) {
  // Fail fast on invalid security configuration before serving login.
  if (!config.issuerUrl) {
    throw new Error('OIDC issuer is required: set OIDC_ISSUER (manual endpoint mode requires explicit issuer)');
  }
  const router = Router();
  const cookieSecret = getCookieSecret();
  const returnTargetPolicy = createReturnTargetPolicy();
  // Capture deployment-derived cookie security once per router (injected config, not per-request env read).
  // Fails closed in production when base URL and protocol disagree.
  const isSecureCookie = getSecureCookieFlag();
  // Coordinator owns provider completion, token persistence, eligibility, provisioning,
  // role sync, tenant mapping/sync, and session issuance. Route is thin adapter.
  const loginCoordinator = createOidcLoginCoordinator({
    config,
    returnTargetPolicy,
    userRepository: n8nRepositories.user,
    projectRepository: n8nRepositories.project,
    tenantProjectRelationRepository: customRepositories.tenantProjectRelation,
    jwtService,
    userService,
    tenantProjectSyncService,
    tenantService,
    cstarService,
  });

  router.get('/login', async (req: Request, res: Response) => {
    const returnTo = resolveReturnTarget(req.query.returnTo, 'login', returnTargetPolicy);
    const existingToken = req.cookies['n8n-auth'];
    if (existingToken && !returnTo) {
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
            returnTo,
          },
          cookieSecret,
        ),
        getCookieOptions(isSecureCookie),
      );
      res.cookie(
        'n8n-oidc-nonce',
        createSignedCookie({ nonce: authRequest.nonce }, cookieSecret),
        getCookieOptions(isSecureCookie),
      );

      res.redirect(authRequest.authorizationUrl);
    } catch (error) {
      logError(log, error, { context: 'OIDC login' });
      res.redirect(buildExternalUiErrorRedirect(toPublicRouteMessage(error)));
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

      const outcome = await loginCoordinator.handleCallback({ code: code as string, statePayload, noncePayload });

      if (outcome.kind === 'eligible') {
        // Atomicity: UI exchange already prepared before n8n token; set n8n-auth only on success.
        res.cookie('n8n-auth', outcome.n8nAuthToken, getAuthCookieOptions(isSecureCookie));
        return res.redirect(outcome.redirectUrl);
      }

      if (outcome.kind === 'access-request') {
        // P0: access-request must never leave a stale n8n-auth in the
        // browser (same-identity eligibility loss or cross-identity switch).
        // The route is the single shared enforcement boundary — coordinator
        // returns the outcome, route terminates any prior n8n session.
        try {
          authService.clearCookie(res);
        } catch {
          // Fall back to direct clear if AuthService derivation throws in
          // misconfigured production (getSecureCookieFlag) — still terminate.
          try {
            res.clearCookie('n8n-auth', { path: '/' });
          } catch {
            // ignore
          }
        }
        return res.redirect(outcome.redirectUrl);
      }

      return res.redirect(buildExternalUiErrorRedirect(outcome.publicMessage));
    } catch (error) {
      logError(log, error, { context: 'OIDC callback' });
      res.redirect(buildExternalUiErrorRedirect('Authentication failed'));
    }
  });

  router.get('/logout', async (req: Request, res: Response) => {
    const requestedReturnTo = resolveReturnTarget(req.query.returnTo, 'logout', returnTargetPolicy) || '/';

    // UI-originated logout carries a short-lived, single-use opaque handle that
    // binds the verified bearer identity to a validated return target. A
    // consumed (or unknown/expired) handle never authorizes anything.
    const logoutHandle = typeof req.query.logout === 'string' ? req.query.logout : '';
    let handleRecord: { email: string; returnTo: string } | null = null;
    if (logoutHandle) {
      try {
        handleRecord = await consumeUiLogoutHandle(logoutHandle);
        if (!handleRecord) {
          log.warn('OIDC logout: logout handle is unknown or already used');
        }
      } catch (error) {
        logError(log, error, { context: 'OIDC logout handle consumption' });
      }
    }

    // Identity is only ever trusted from the authenticated logout handle or a
    // valid n8n cookie — never from caller-supplied query parameters.
    const boundReturnTo = handleRecord
      ? resolveReturnTarget(handleRecord.returnTo, 'logout', returnTargetPolicy) || requestedReturnTo
      : requestedReturnTo;
    const returnTo = appendQueryParam(boundReturnTo, 'signedOut', '1');

    try {
      let email = handleRecord?.email ?? '';
      const token = req.cookies['n8n-auth'];

      if (token) {
        try {
          const [user] = await authService.resolveJwt(token, req, res);
          if (!email) {
            email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
          }
          await authService.invalidateToken(req as any);
        } catch (error) {
          // An invalid cookie must not fall back to caller-controlled identity.
          log.debug('OIDC logout: failed to resolve or invalidate n8n session', { error: String(error) });
        }
      }

      authService.clearCookie(res);

      if (!email) {
        log.debug('OIDC logout: no authenticated identity, redirecting without touching token records', {
          returnTo,
        });
        res.redirect(returnTo);
        return;
      }

      // Local session cleanup happens before any upstream work so provider
      // discovery or network failure cannot prevent revocation.
      const idToken = await getUiOidcIdToken(email);
      await deleteUiOidcTokens(email);
      if (!idToken) {
        log.debug('OIDC logout: no ID token stored, redirecting directly', { email, returnTo });
        res.redirect(returnTo);
        return;
      }

      const discovery = await fetchOidcDiscoveryDocument(config);

      const endSessionEndpoint = discovery.end_session_endpoint || config.endSessionEndpoint;
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

/**
 * Coordinator owns eligibility/role resolution. This export is a
 * backwards-compatible delegate — one implementation (`resolveNextRoleInternal`)
 * owns the decision. Kept for existing tests/routes that import from this module.
 */
export async function resolveNextRole(params: ResolveNextRoleParams): Promise<string> {
  return resolveNextRoleInternal(params);
}

// --- Extracted helpers to reduce callback cognitive complexity ---

type CallbackValidationResult =
  | { redirect: string; code: null; statePayload: null; noncePayload: null }
  | {
      redirect: null;
      code: string;
      statePayload: N8nOidcStateCookiePayload;
      noncePayload: N8nOidcNonceCookiePayload;
    };

function validateCallbackRequest(req: Request, cookieSecret: string): CallbackValidationResult {
  const { code, state, error, error_description } = req.query;

  if (error) {
    // Log detailed provider error server-side; never reflect error_description verbatim (may contain hostile text/secrets).
    log.error('OIDC error from provider', { error, errorDescription: error_description });
    const publicCode = toPublicProviderErrorCode(error);
    return {
      redirect: buildExternalUiErrorRedirect(publicCode),
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

  if (!noncePayload || typeof noncePayload.nonce !== 'string' || !noncePayload.nonce) {
    return {
      redirect: buildExternalUiErrorRedirect('Missing or invalid nonce - session expired'),
      code: null,
      statePayload: null,
      noncePayload: null,
    };
  }

  return { redirect: null, code: code as string, statePayload, noncePayload };
}
