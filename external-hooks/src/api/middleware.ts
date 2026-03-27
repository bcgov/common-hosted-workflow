import { drizzle } from 'drizzle-orm/node-postgres';
import {
  MessageRepository,
  TenantProjectRelationRepository,
} from '../db/repository/workflow-interaction-layer/message';

/** Common n8n custom API: constants, types, auth, helpers, and hook factory. */

export const LOG_PREFIX = '[Custom APIs]';

export const N8N_DI_PATH = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/di';
export const N8N_DB_PATH = '/usr/local/lib/node_modules/n8n/node_modules/@n8n/db';
export const N8N_API_KEY_SERVICE_PATH = '/usr/local/lib/node_modules/n8n/dist/services/public-api-key.service.js';

export const N8N_API_KEY_HEADER = 'X-N8N-API-KEY'; // pragma: allowlist secret

/** Required on message routes */
export const X_TENANT_ID_HEADER = 'X-TENANT-ID';

const AUTHORIZATION_HEADER = 'Authorization';

/** Extracts the bearer token from `Authorization: Bearer <token>`. */
function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  return match?.[1]?.trim?.() ?? null;
}

const TENANT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface Scope {
  slug: string;
  displayName: string;
  description: string | null;
}

export interface Role {
  updatedAt: string;
  createdAt: string;
  slug: string;
  displayName: string;
  description: string;
  systemRole: boolean;
  roleType: string;
  scopes: Scope[];
}

export interface User {
  updatedAt: string;
  createdAt: string;
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  personalizationAnswers: unknown;
  settings: {
    userActivated: boolean;
    easyAIWorkflowOnboarded: boolean;
  };
  disabled: boolean;
  mfaEnabled: boolean;
  lastActiveAt: string;
  role: Role;
  isPending: boolean;
}

type AuthRequest = {
  header: (name: string) => string | undefined;
  caller?: User;
  params?: Record<string, string | undefined>;
  chwfTenantId?: string;
  /** Intersection of tenant's projects and n8n projects the caller may access. */
  chwfAllowedProjectIds?: string[];
  /** True when Authorization bearer matches INTERNAL_AUTH_TOKEN (internal n8n workflow calls). */
  chwfInternal?: boolean;
};

type AuthResponse = {
  status: (code: number) => { json: (payload: unknown) => unknown };
};

type Next = () => void;

type ApiKeyService = {
  getUserForApiKey: (token: string) => Promise<User>;
};

export interface AuthMiddlewareConfig {
  apiKeyService: ApiKeyService;
  globalOwnerRoleSlug: string;
  globalAdminRoleSlug: string;
  logPrefix: string;
}

/** First 8 chars of a UUID for logs (avoid logging full IDs in shared logs). */
export function shortIdForLog(id: string | undefined): string {
  if (!id) return '(none)';
  const t = id.trim();
  return t.length > 8 ? `${t.slice(0, 8)}…` : t;
}

type PgishError = Error & {
  code?: string;
  detail?: string;
  constraint?: string;
  column?: string;
  table?: string;
  cause?: unknown;
};

/** Walks Error.cause chains (Drizzle → driver) so CHECK/FK violations show `code` / `constraint` / `detail`. */
export function formatDbErrorForLog(error: unknown): string {
  const segments: string[] = [];
  let e: unknown = error;
  for (let depth = 0; e && depth < 8; depth++) {
    if (!(e instanceof Error)) break;
    const x = e as PgishError;
    const bit = [
      x.message,
      x.code && `code=${x.code}`,
      x.constraint && `constraint=${x.constraint}`,
      x.detail && `detail=${x.detail}`,
    ]
      .filter(Boolean)
      .join(' ');
    if (bit) segments.push(bit);
    e = x.cause;
  }
  return segments.join(' || ');
}

export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  const { apiKeyService, globalOwnerRoleSlug, globalAdminRoleSlug, logPrefix } = config;

  /** Validates X-N8N-API-KEY and hydrates `req.caller` for downstream handlers. */
  const apiKeyAuthMiddleware = async (req: AuthRequest, res: AuthResponse, next: Next) => {
    try {
      const token = req.header(N8N_API_KEY_HEADER);

      if (!token) {
        console.warn(logPrefix, `[401] Access denied: No API key provided.`);
        return res.status(401).json({ error: 'No API key provided' });
      }

      const caller = await apiKeyService.getUserForApiKey(token);

      if (!caller || caller.disabled) {
        console.warn(logPrefix, `[apiKeyAuth] rejecting: missing caller or disabled`);
        return res.status(401).json({ error: 'Invalid API key' });
      }
      req.caller = caller;
      next();
    } catch (error) {
      console.warn(logPrefix, `[401] Invalid API key: ${(error as Error).message}`);
      console.debug(`${logPrefix} [apiKeyAuth] stack`, (error as Error).stack);
      return res.status(401).json({ error: 'Invalid API key' });
    }
  };

  /** Admin-only guard layered on top of api-key auth (global owner/admin role slugs only). */
  const adminAuthMiddleware = async (req: AuthRequest, res: AuthResponse, next: Next) => {
    const authResult = await apiKeyAuthMiddleware(req, res, () => undefined);
    if (!req.caller) {
      console.warn(logPrefix, `[adminAuth] no caller after apiKeyAuth — stopping (401 path)`);
      return authResult;
    }

    const slug = req.caller.role?.slug;
    const allowed = [globalOwnerRoleSlug, globalAdminRoleSlug];
    const isGlobalAdmin = slug !== undefined && allowed.includes(slug);

    if (!isGlobalAdmin) {
      console.warn(logPrefix, `[403] Forbidden: ${req.caller.email} lacks Admin/Owner privileges.`);
      return res.status(403).json({ error: 'Global admin access required.' });
    }

    next();
  };

  return { apiKeyAuthMiddleware, adminAuthMiddleware };
}

/** Shared request/response helpers for route handlers */
export const validateNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const parsePositiveInteger = (value: string | undefined) => {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export const parseDate = (value: string | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

/**
 * n8n project access: project relation row (team / shared) or personal project owner.
 */
export async function callerHasN8nProjectAccess(
  projectRepository: { getPersonalProjectForUser: (userId: string) => Promise<{ id: string } | null> },
  projectRelationRepository: {
    findProjectRole: (args: { userId: string; projectId: string }) => Promise<unknown>;
  },
  userId: string,
  projectId: string,
): Promise<boolean> {
  const role = await projectRelationRepository.findProjectRole({ userId, projectId });
  if (role) return true;
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  return personal?.id === projectId;
}

/** All project IDs the user can access in n8n (personal + project relations). */
export async function getAccessibleProjectIdsForUser(
  projectRepository: { getPersonalProjectForUser: (userId: string) => Promise<{ id: string } | null> },
  projectRelationRepository: { findAllByUser: (userId: string) => Promise<Array<{ projectId: string }>> },
  userId: string,
): Promise<string[]> {
  const relations = await projectRelationRepository.findAllByUser(userId);
  const ids = new Set<string>(relations.map((r) => r.projectId));
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  if (personal?.id) ids.add(personal.id);
  return [...ids];
}

/**
 * After `apiKeyAuthMiddleware`: require `X-TENANT-ID`, load all `project_id`s for that tenant from
 * `tenant_project_relation`, intersect with the caller's n8n-accessible projects, attach
 * `chwfAllowedProjectIds` for handlers.
 *
 * POST is internal-only and must include `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`.
 * GET and POST both use the same tenant + caller project scope from this middleware.
 */
export function createMessageTenantProjectMiddleware(config: {
  tenantProjectRelationRepository: TenantProjectRelationRepository;
  projectRepository: any;
  projectRelationRepository: any;
  logPrefix: string;
}) {
  const { tenantProjectRelationRepository, projectRepository, projectRelationRepository, logPrefix } = config;

  /**
   * Tenant-access branch:
   * tenant projects ∩ caller-accessible n8n projects -> req.chwfAllowedProjectIds.
   */
  const handleTenantScopedAccess = async (
    req: AuthRequest,
    res: AuthResponse,
    next: Next,
    tenantId: string,
    callerId: string,
  ) => {
    const tenantProjectIds = await tenantProjectRelationRepository.getProjectIdsByTenantId(tenantId);

    if (tenantProjectIds.length === 0) {
      console.warn(logPrefix, `[messageTenant] 403 no projects for tenant`);
      return res.status(403).json({ error: 'No projects linked to this tenant' });
    }

    const userProjectIds = await getAccessibleProjectIdsForUser(projectRepository, projectRelationRepository, callerId);

    const userSet = new Set(userProjectIds);
    const allowed = tenantProjectIds.filter((id) => userSet.has(id));

    if (allowed.length === 0) {
      console.warn(
        logPrefix,
        `[messageTenant] 403 intersection empty (tenant has projects but caller cannot access any)`,
      );
      return res.status(403).json({ error: 'User has no access to any project for this tenant' });
    }

    req.chwfTenantId = tenantId;
    req.chwfAllowedProjectIds = allowed;
    next();
  };

  /**
   * Message auth+scope middleware:
   * - ALL message calls must provide X-TENANT-ID (internal and external).
   * - POST additionally requires valid INTERNAL_AUTH_TOKEN bearer.
   * - Effective scope is tenant projects intersected with caller-accessible n8n projects.
   */
  return async (req: AuthRequest, res: AuthResponse, next: Next) => {
    const method = (req as { method?: string }).method?.toUpperCase?.() ?? '';
    const urlPath =
      ((req as { originalUrl?: string }).originalUrl ?? (req as { path?: string }).path ?? '').split('?')[0] ?? '';
    const isPostCreateMessage = method === 'POST' && /\/rest\/custom\/v1\/messages\/?$/.test(urlPath);

    // Authorization bearer is validated for internal-only POST.
    const bearerToken = extractBearerToken(req.header(AUTHORIZATION_HEADER));
    const internalAuthToken = process.env.INTERNAL_AUTH_TOKEN;
    const isInternalCall = Boolean(internalAuthToken && bearerToken && bearerToken === internalAuthToken);
    req.chwfInternal = isInternalCall;

    if (isPostCreateMessage) {
      if (!internalAuthToken) {
        console.warn(logPrefix, `[messageTenant] 500 INTERNAL_AUTH_TOKEN missing`);
        return res.status(500).json({ error: 'INTERNAL_AUTH_TOKEN not configured' });
      }
      if (!isInternalCall) {
        console.warn(logPrefix, `[messageTenant] 401 POST internal auth failed bearerPresent=${Boolean(bearerToken)}`);
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const tenantId = req.header(X_TENANT_ID_HEADER)?.trim();
    if (!tenantId) {
      console.warn(
        logPrefix,
        `[messageTenant] 400 missing ${X_TENANT_ID_HEADER}; expectedHeader=${X_TENANT_ID_HEADER}`,
      );
      return res.status(400).json({ error: `Missing ${X_TENANT_ID_HEADER} header` });
    }
    if (!TENANT_UUID_RE.test(tenantId)) {
      console.warn(logPrefix, `[messageTenant] 400 invalid tenant UUID preview=${shortIdForLog(tenantId)}`);
      return res.status(400).json({ error: `Invalid ${X_TENANT_ID_HEADER} (expected UUID)` });
    }

    try {
      return await handleTenantScopedAccess(req, res, next, tenantId, req.caller.id);
    } catch (error) {
      console.error(logPrefix, `[messageTenant] 500 ${(error as Error).message}`, (error as Error).stack);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}

/**
 * Builds the n8n external-hooks config. Uses `require()` inside `ready` for route modules
 * to avoid circular imports with `admin.ts` / `message.ts`.
 */
export function createHookConfig() {
  return {
    n8n: {
      ready: [
        async function (server: { app: any }) {
          console.info(`${LOG_PREFIX} 🚀 Initializing Custom Endpoints...`);

          const { registerAdminRoutes } = require('./admin') as typeof import('./admin');
          const { registerMessageRoutes } =
            require('./workflow-interaction-layer/message') as typeof import('./workflow-interaction-layer/message');

          const { Container } = require(N8N_DI_PATH);
          const {
            withTransaction,
            UserRepository,
            ProjectRepository,
            ProjectRelationRepository,
            WorkflowRepository,
            SharedWorkflowRepository,
            GLOBAL_OWNER_ROLE,
            GLOBAL_ADMIN_ROLE,
          } = require(N8N_DB_PATH);
          const { PublicApiKeyService } = require(N8N_API_KEY_SERVICE_PATH);

          const apiKeyService = Container.get(PublicApiKeyService);
          const userRepository = Container.get(UserRepository);
          const projectRepository = Container.get(ProjectRepository);
          const projectRelationRepository = Container.get(ProjectRelationRepository);
          const workflowRepository = Container.get(WorkflowRepository);
          const sharedWorkflowRepository = Container.get(SharedWorkflowRepository);

          const { apiKeyAuthMiddleware, adminAuthMiddleware } = createAuthMiddleware({
            apiKeyService,
            globalOwnerRoleSlug: GLOBAL_OWNER_ROLE.slug,
            globalAdminRoleSlug: GLOBAL_ADMIN_ROLE.slug,
            logPrefix: LOG_PREFIX,
          });

          const databaseUrl = process.env.CUSTOM_DATABASE_URL;
          if (!databaseUrl) {
            throw new Error('CUSTOM_DATABASE_URL is not set');
          }
          const db = drizzle(databaseUrl);
          const { app } = server;
          const tenantProjectRelationRepository = new TenantProjectRelationRepository(db);
          const messageRepository = new MessageRepository(db);

          const messageTenantProjectMiddleware = createMessageTenantProjectMiddleware({
            tenantProjectRelationRepository,
            projectRepository,
            projectRelationRepository,
            logPrefix: LOG_PREFIX,
          });

          registerAdminRoutes({
            app,
            adminAuthMiddleware,
            logPrefix: LOG_PREFIX,
            userRepository,
            projectRepository,
            workflowRepository,
            sharedWorkflowRepository,
            withTransaction,
            tenantProjectRelationRepository,
          });

          registerMessageRoutes({
            app,
            apiKeyAuthMiddleware,
            messageTenantProjectMiddleware,
            messageRepository,
            sharedWorkflowRepository,
            logPrefix: LOG_PREFIX,
          });

          console.info(`${LOG_PREFIX} ✅ Custom Routes Active.`);
        },
      ],
    },
  };
}
