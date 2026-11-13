'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createWorkflowInteractionTenantMiddleware = createWorkflowInteractionTenantMiddleware;
const headers_1 = require('../constants/headers');
const route_patterns_1 = require('../constants/route-patterns');
const regex_1 = require('../constants/regex');
const bearer_1 = require('../helpers/bearer');
const project_access_1 = require('../services/project-access');
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const string_1 = require('../utils/string');
const _config_1 = require('@config');
const log = (0, logger_1.createLogger)('CustomAPIs');
/**
 * Workflow interaction (messages + actions): after API key auth, resolves tenant -> projects from
 * `tenant_project_relation`, intersects with the caller's n8n-accessible projects, and sets
 * `res.locals.chwfAllowedProjectIds` for handlers.
 *
 * For POST `/v1/messages/` and POST `/v1/actions`, also requires `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`
 * when `INTERNAL_AUTH_TOKEN` is set (`workflowInteractionInternalPostPathPattern`).
 */
function createWorkflowInteractionTenantMiddleware(config) {
  const { project: projectRepository, projectRelation: projectRelationRepository } = config.n8nRepositories;
  const { tenantProjectRelation: tenantProjectRelationRepository } = config.customRepositories;
  /**
   * Tenant-access branch:
   * tenant projects ∩ caller-accessible n8n projects -> res.locals.chwfAllowedProjectIds.
   */
  const handleTenantScopedAccess = async (res, next, tenantId, callerId) => {
    const tenantProjectIds = await tenantProjectRelationRepository.getProjectIdsByTenantId(tenantId);
    if (tenantProjectIds.length === 0) {
      log.warn('No projects for tenant', { handler: 'workflowInteractionTenant', statusCode: 403 });
      return next(new errors_1.AppError(403, 'No projects linked to this tenant'));
    }
    const userProjectIds = await (0, project_access_1.listProjectIdsAccessibleToUser)(
      projectRepository,
      projectRelationRepository,
      callerId,
    );
    const userSet = new Set(userProjectIds);
    const allowed = tenantProjectIds.filter((id) => userSet.has(id));
    if (allowed.length === 0) {
      log.warn('Intersection empty: tenant has projects but caller cannot access any', {
        handler: 'workflowInteractionTenant',
        statusCode: 403,
      });
      return next(new errors_1.AppError(403, 'User has no access to any project for this tenant'));
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
  return async (req, res, next) => {
    const method = req.method?.toUpperCase?.() ?? '';
    const urlPath = (req.originalUrl ?? req.path ?? '').split('?')[0] ?? '';
    const isPostCreateInternalOnly =
      method === 'POST' && route_patterns_1.workflowInteractionInternalPostPathPattern.test(urlPath);
    // Authorization bearer is validated for internal-only POST.
    const bearerToken = (0, bearer_1.extractBearerToken)(req.header(headers_1.AUTHORIZATION_HEADER));
    const isInternalCall = Boolean(
      _config_1.INTERNAL_AUTH_TOKEN && bearerToken && bearerToken === _config_1.INTERNAL_AUTH_TOKEN,
    );
    res.locals.chwfInternal = isInternalCall;
    if (isPostCreateInternalOnly) {
      if (!_config_1.INTERNAL_AUTH_TOKEN) {
        log.warn('INTERNAL_AUTH_TOKEN not configured', {
          handler: 'workflowInteractionTenant',
          statusCode: 500,
        });
        return next(new errors_1.AppError(500, 'INTERNAL_AUTH_TOKEN not configured'));
      }
      if (!isInternalCall) {
        log.warn('POST internal auth failed', {
          handler: 'messageTenant',
          statusCode: 401,
          bearerPresent: Boolean(bearerToken),
        });
        return next(new errors_1.AppError(401, 'Unauthorized'));
      }
    }
    const tenantId = req.header(headers_1.X_TENANT_ID_HEADER)?.trim();
    if (!tenantId) {
      log.warn('Missing tenant ID header', {
        handler: 'workflowInteractionTenant',
        statusCode: 400,
        expectedHeader: headers_1.X_TENANT_ID_HEADER,
      });
      return next(new errors_1.AppError(400, `Missing ${headers_1.X_TENANT_ID_HEADER} header`));
    }
    if (!regex_1.tenantUuidRegex.test(tenantId)) {
      log.warn('Invalid tenant UUID', {
        handler: 'messageTenant',
        statusCode: 400,
        tenantIdPreview: (0, string_1.shortenIdForLog)(tenantId),
      });
      return next(new errors_1.AppError(400, `Invalid ${headers_1.X_TENANT_ID_HEADER} (expected UUID)`));
    }
    if (!res.locals.caller?.id) {
      return next(new errors_1.AppError(401, 'Unauthorized'));
    }
    try {
      await handleTenantScopedAccess(res, next, tenantId, res.locals.caller.id);
    } catch (error) {
      log.error('Workflow interaction tenant error', {
        handler: 'workflowInteractionTenant',
        statusCode: 500,
        error: error.message,
        stack: error.stack,
      });
      return next(error instanceof errors_1.AppError ? error : new errors_1.AppError(500, 'Internal Server Error'));
    }
  };
}
