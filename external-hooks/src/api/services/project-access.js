'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.listProjectIdsAccessibleToUser = listProjectIdsAccessibleToUser;
exports.extractRoleSlug = extractRoleSlug;
exports.getViewerProjectRole = getViewerProjectRole;
exports.verifyCallerHasN8nProjectAccess = verifyCallerHasN8nProjectAccess;
exports.resolveWorkflowProjectScope = resolveWorkflowProjectScope;
exports.validateN8nExecutionMatchesWorkflow = validateN8nExecutionMatchesWorkflow;
exports.validateN8nExecutionInTenantScope = validateN8nExecutionInTenantScope;
exports.requireChwfAllowedProjectIds = requireChwfAllowedProjectIds;
exports.resolveProjectIdForCreate = resolveProjectIdForCreate;
exports.requireExecutionInTenantScope = requireExecutionInTenantScope;
const project_roles_1 = require('../constants/project-roles');
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const db_helper_1 = require('../helpers/db-helper');
const log = (0, logger_1.createLogger)('ProjectAccess');
const INVALID_WORKFLOW_INSTANCE_ID = 'Invalid workflowInstanceId';
/* ------------------------------------------------------------------ */
/*  Project-scope helpers                                               */
/* ------------------------------------------------------------------ */
/** Lists all project IDs the user can access in n8n (personal + project relations). */
async function listProjectIdsAccessibleToUser(projectRepository, projectRelationRepository, userId) {
  const relations = await projectRelationRepository.findAllByUser(userId);
  const ids = new Set(relations.map((r) => r.projectId));
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  if (personal?.id) ids.add(personal.id);
  return [...ids];
}
/**
 * Extracts the role slug from whatever shape n8n's findProjectRole returns.
 * n8n's findProjectRole uses findOneBy (no relation loading), so the `role` column
 * value is returned directly as a string (the slug), not a Role entity.
 */
function extractRoleSlug(role) {
  // Direct string — the raw column value (most common case)
  if (typeof role === 'string') {
    return role;
  }
  if (!role || typeof role !== 'object') {
    return null;
  }
  const record = role;
  // Object with slug property (Role entity if relation was loaded)
  if (typeof record.slug === 'string') {
    return record.slug;
  }
  // Nested role.slug (defensive)
  if (record.role && typeof record.role === 'object') {
    const nested = record.role;
    if (typeof nested.slug === 'string') {
      return nested.slug;
    }
  }
  // role field is itself a string (e.g. from raw relation column)
  if (typeof record.role === 'string') {
    return record.role;
  }
  return null;
}
/**
 * The viewer's n8n project role slug for one project: the `project_relation`
 * role (project:admin / project:editor / project:viewer / project:personalOwner),
 * or null when the viewer is not a member. Deliberately membership-based only —
 * a platform admin without a relation gets null, so role-scoped UI affordances
 * never light up from admin status alone.
 */
async function getViewerProjectRole(projectRepository, projectRelationRepository, userId, projectId) {
  const role = await projectRelationRepository.findProjectRole({ userId, projectId });
  const roleSlug = extractRoleSlug(role);
  if (roleSlug) return roleSlug;
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  return personal?.id === projectId ? project_roles_1.PROJECT_ROLE_PERSONAL_OWNER : null;
}
/**
 * n8n project access: project relation row (team / shared) or personal project owner.
 */
async function verifyCallerHasN8nProjectAccess(projectRepository, projectRelationRepository, userId, projectId) {
  const role = await projectRelationRepository.findProjectRole({ userId, projectId });
  if (role) return true;
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  return personal?.id === projectId;
}
/**
 * Projects that own the workflow in n8n (`SharedWorkflow`), filtered to those also allowed for this
 * tenant/user. Create handlers use the first id in the result as `projectId`.
 */
async function resolveWorkflowProjectScope(workflowId, allowedProjectIds, sharedWorkflowRepository) {
  const workflowProjectIds = await sharedWorkflowRepository.findProjectIds(workflowId);
  const allowedSet = new Set(allowedProjectIds);
  return workflowProjectIds.filter((id) => allowedSet.has(id));
}
/* ------------------------------------------------------------------ */
/*  Execution-scope validation                                          */
/* ------------------------------------------------------------------ */
/**
 * Ensures the n8n execution row exists and matches the claimed `workflowId` (stops spoofed instance ids).
 */
async function validateN8nExecutionMatchesWorkflow(params) {
  const execution = await params.executionRepository.loadMetadataOrNull(params.workflowInstanceId);
  if (!execution) {
    return { ok: false, status: 400, error: INVALID_WORKFLOW_INSTANCE_ID };
  }
  if (execution.workflowId !== params.workflowId) {
    return { ok: false, status: 400, error: 'workflowInstanceId does not match workflowId' };
  }
  return { ok: true };
}
/**
 * For GET list filters: execution must exist and its workflow must intersect tenant + caller project scope.
 */
async function validateN8nExecutionInTenantScope(params) {
  const execution = await params.executionRepository.loadMetadataOrNull(params.workflowInstanceId);
  if (!execution) {
    return { ok: false, status: 400, error: INVALID_WORKFLOW_INSTANCE_ID };
  }
  const scoped = await resolveWorkflowProjectScope(
    execution.workflowId,
    params.allowedProjectIds,
    params.sharedWorkflowRepository,
  );
  if (!scoped.length) {
    return {
      ok: false,
      status: 403,
      error: 'workflowInstanceId is not accessible for this tenant/user scope',
    };
  }
  return { ok: true };
}
/**
 * Guard for handlers after `createWorkflowInteractionTenantMiddleware`: ensures scope was attached.
 * Throws `AppError` 403 if locals are missing (e.g. mis-ordered middleware).
 */
function requireChwfAllowedProjectIds(res, routeLabel, logDomain) {
  const allowed = res.locals.chwfAllowedProjectIds;
  if (!allowed?.length) {
    log.warn('Missing tenant/user scoped projects', {
      domain: logDomain,
      route: routeLabel,
      statusCode: 403,
    });
    throw new errors_1.AppError(403, 'Missing tenant project scope');
  }
  return allowed;
}
/**
 * Validates the n8n execution matches the claimed workflowId, then resolves a `projectId` from the
 * intersection of the workflow's shared-project list and the caller's allowed tenant projects.
 *
 * Throws `AppError` on validation failure or scope mismatch. Unexpected errors are logged and
 * re-thrown as 500.
 */
async function resolveProjectIdForCreate(params) {
  try {
    const execCheck = await validateN8nExecutionMatchesWorkflow({
      executionRepository: params.executionRepository,
      workflowInstanceId: params.workflowInstanceId,
      workflowId: params.workflowId,
    });
    if (execCheck.ok === false) {
      throw new errors_1.AppError(execCheck.status, execCheck.error);
    }
    const scopedWorkflowProjects = await resolveWorkflowProjectScope(
      params.workflowId,
      params.allowedProjectIds,
      params.sharedWorkflowRepository,
    );
    if (!scopedWorkflowProjects.length) {
      throw new errors_1.AppError(403, 'workflowId is not accessible for this tenant/user scope');
    }
    return scopedWorkflowProjects[0];
  } catch (error) {
    if (error instanceof errors_1.AppError) throw error;
    const dbDetail = (0, db_helper_1.formatDbErrorForLog)(error);
    log.error(`${params.logLabel} resolution error`, { statusCode: 500, dbDetail, error: String(error) });
    throw new errors_1.AppError(500, 'Internal Server Error');
  }
}
/**
 * For GET list filters: when `workflowInstanceId` is provided, validates that the execution exists
 * and its workflow intersects the caller's tenant/project scope. Throws `AppError` on failure.
 * No-ops when `workflowInstanceId` is `undefined`.
 */
async function requireExecutionInTenantScope(params) {
  if (!params.workflowInstanceId) return;
  const scopeCheck = await validateN8nExecutionInTenantScope({
    executionRepository: params.executionRepository,
    workflowInstanceId: params.workflowInstanceId,
    allowedProjectIds: params.allowedProjectIds,
    sharedWorkflowRepository: params.sharedWorkflowRepository,
  });
  if (scopeCheck.ok === false) {
    throw new errors_1.AppError(scopeCheck.status, scopeCheck.error);
  }
}
