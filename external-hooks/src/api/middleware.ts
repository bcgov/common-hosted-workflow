import { AUTHORIZATION_HEADER, N8N_API_KEY_HEADER, X_TENANT_ID_HEADER } from './constants/headers';
import { LOG_PREFIX } from './constants/logging';
import { workflowInteractionInternalPostPathPattern } from './constants/route-patterns';
import { tenantUuidRegex } from './constants/regex';
import { extractBearerToken } from './helpers/bearer';
import { listN8nProjectIdsAccessibleToUser } from './helpers/n8n-validation';
import { shortenIdForLog } from './utils/string';
import type { AuthMiddlewareConfig, AuthRequest, AuthResponse, ExpressNext } from './types/auth';
import type { CustomRepositories, N8nRepositories } from './types/repositories';
import { AppError } from './utils/errors';

/** Runs a middleware and completes when it calls `next()` or `next(err)`. */
function runMiddleware(
  mw: (req: AuthRequest, res: AuthResponse, next: ExpressNext) => void | Promise<void>,
  req: AuthRequest,
  res: AuthResponse,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done: ExpressNext = (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    };
    void Promise.resolve(mw(req, res, done)).catch(reject);
  });
}

/** n8n external-hooks: auth middleware, workflow-interaction tenant scope, and hook factory. */

export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  const { apiKeyService, globalOwnerRoleSlug, globalAdminRoleSlug } = config;

  /** Validates X-N8N-API-KEY and hydrates `res.locals.caller` for downstream handlers. */
  const apiKeyAuthMiddleware = async (req: AuthRequest, res: AuthResponse, next: ExpressNext) => {
    try {
      const token = req.header(N8N_API_KEY_HEADER);

      if (!token) {
        console.warn(LOG_PREFIX, `[401] Access denied: No API key provided.`);
        return next(new AppError(401, 'No API key provided'));
      }

      const caller = await apiKeyService.getUserForApiKey(token);

      if (!caller || caller.disabled) {
        console.warn(LOG_PREFIX, `[apiKeyAuth] rejecting: missing caller or disabled`);
        return next(new AppError(401, 'Invalid API key'));
      }
      res.locals.caller = caller;
      next();
    } catch (error) {
      console.warn(LOG_PREFIX, `[401] Invalid API key: ${(error as Error).message}`);
      console.debug(`${LOG_PREFIX} [apiKeyAuth] stack`, (error as Error).stack);
      return next(new AppError(401, 'Invalid API key'));
    }
  };

  /** Admin-only guard layered on top of api-key auth (global owner/admin role slugs only). */
  const adminAuthMiddleware = async (req: AuthRequest, res: AuthResponse, next: ExpressNext) => {
    try {
      await runMiddleware(apiKeyAuthMiddleware, req, res);
    } catch (err) {
      return next(err);
    }

    if (!res.locals.caller) {
      console.warn(LOG_PREFIX, `[adminAuth] no caller after apiKeyAuth — stopping (401 path)`);
      return next(new AppError(401, 'Invalid API key'));
    }

    const slug = res.locals.caller.role?.slug;
    const allowed = [globalOwnerRoleSlug, globalAdminRoleSlug];
    const isGlobalAdmin = slug !== undefined && allowed.includes(slug);

    if (!isGlobalAdmin) {
      console.warn(LOG_PREFIX, `[403] Forbidden: ${res.locals.caller.email} lacks Admin/Owner privileges.`);
      return next(new AppError(403, 'Global admin access required.'));
    }

    next();
  };

  return { apiKeyAuthMiddleware, adminAuthMiddleware };
}

/**
 * Workflow interaction (messages + actions): after API key auth, resolves tenant → projects from
 * `tenant_project_relation`, intersects with the caller’s n8n-accessible projects, and sets
 * `res.locals.chwfAllowedProjectIds` for handlers.
 *
 * For POST `/v1/messages/` and POST `/v1/actions`, also requires `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`
 * when `INTERNAL_AUTH_TOKEN` is set (`workflowInteractionInternalPostPathPattern`).
 */
export function createWorkflowInteractionTenantMiddleware(config: {
  n8nRepositories: Pick<N8nRepositories, 'project' | 'projectRelation'>;
  customRepositories: Pick<CustomRepositories, 'tenantProjectRelation'>;
}) {
  const { project: projectRepository, projectRelation: projectRelationRepository } = config.n8nRepositories;
  const { tenantProjectRelation: tenantProjectRelationRepository } = config.customRepositories;

  /**
   * Tenant-access branch:
   * tenant projects ∩ caller-accessible n8n projects -> res.locals.chwfAllowedProjectIds.
   */
  const handleTenantScopedAccess = async (res: AuthResponse, next: ExpressNext, tenantId: string, callerId: string) => {
    const tenantProjectIds = await tenantProjectRelationRepository.getProjectIdsByTenantId(tenantId);

    if (tenantProjectIds.length === 0) {
      console.warn(LOG_PREFIX, `[workflowInteractionTenant] 403 no projects for tenant`);
      return next(new AppError(403, 'No projects linked to this tenant'));
    }

    const userProjectIds = await listN8nProjectIdsAccessibleToUser(
      projectRepository,
      projectRelationRepository,
      callerId,
    );

    const userSet = new Set(userProjectIds);
    const allowed = tenantProjectIds.filter((id) => userSet.has(id));

    if (allowed.length === 0) {
      console.warn(
        LOG_PREFIX,
        `[workflowInteractionTenant] 403 intersection empty (tenant has projects but caller cannot access any)`,
      );
      return next(new AppError(403, 'User has no access to any project for this tenant'));
    }

    res.locals.chwfTenantId = tenantId;
    res.locals.chwfAllowedProjectIds = allowed;
    next();
  };

  /**
   * Workflow interaction layer (messages + action requests): tenant + caller project scope.
   * - All such routes must provide X-TENANT-ID (internal and external).
   * - POST create on messages/actions requires valid INTERNAL_AUTH_TOKEN bearer.
   */
  return async (req: AuthRequest, res: AuthResponse, next: ExpressNext) => {
    const method = (req as { method?: string }).method?.toUpperCase?.() ?? '';
    const urlPath =
      ((req as { originalUrl?: string }).originalUrl ?? (req as { path?: string }).path ?? '').split('?')[0] ?? '';
    const isPostCreateInternalOnly = method === 'POST' && workflowInteractionInternalPostPathPattern.test(urlPath);

    // Authorization bearer is validated for internal-only POST.
    const bearerToken = extractBearerToken(req.header(AUTHORIZATION_HEADER));
    const internalAuthToken = process.env.INTERNAL_AUTH_TOKEN;
    const isInternalCall = Boolean(internalAuthToken && bearerToken && bearerToken === internalAuthToken);
    res.locals.chwfInternal = isInternalCall;

    if (isPostCreateInternalOnly) {
      if (!internalAuthToken) {
        console.warn(LOG_PREFIX, `[workflowInteractionTenant] 500 INTERNAL_AUTH_TOKEN missing`);
        return next(new AppError(500, 'INTERNAL_AUTH_TOKEN not configured'));
      }
      if (!isInternalCall) {
        console.warn(LOG_PREFIX, `[messageTenant] 401 POST internal auth failed bearerPresent=${Boolean(bearerToken)}`);
        return next(new AppError(401, 'Unauthorized'));
      }
    }

    const tenantId = req.header(X_TENANT_ID_HEADER)?.trim();
    if (!tenantId) {
      console.warn(
        LOG_PREFIX,
        `[workflowInteractionTenant] 400 missing ${X_TENANT_ID_HEADER}; expectedHeader=${X_TENANT_ID_HEADER}`,
      );
      return next(new AppError(400, `Missing ${X_TENANT_ID_HEADER} header`));
    }
    if (!tenantUuidRegex.test(tenantId)) {
      console.warn(LOG_PREFIX, `[messageTenant] 400 invalid tenant UUID preview=${shortenIdForLog(tenantId)}`);
      return next(new AppError(400, `Invalid ${X_TENANT_ID_HEADER} (expected UUID)`));
    }

    if (!res.locals.caller?.id) {
      return next(new AppError(401, 'Unauthorized'));
    }

    try {
      await handleTenantScopedAccess(res, next, tenantId, res.locals.caller.id);
    } catch (error) {
      console.error(LOG_PREFIX, `[workflowInteractionTenant] 500 ${(error as Error).message}`, (error as Error).stack);
      return next(error instanceof AppError ? error : new AppError(500, 'Internal Server Error'));
    }
  };
}
