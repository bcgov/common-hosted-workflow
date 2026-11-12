import type { Response } from 'express';
import type { ProjectRepository } from '../../db/repository/n8n/project';
import type { ProjectRelationRepository } from '../../db/repository/n8n/project-relation';
import type { SharedWorkflowRepository } from '../../db/repository/n8n/shared-workflow';
import { ExecutionRepository } from '../../db/repository/n8n/execution';
import { PROJECT_ROLE_PERSONAL_OWNER } from '../constants/project-roles';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { formatDbErrorForLog } from '../helpers/db-helper';

const log = createLogger('ProjectAccess');

type ValidationFail = { ok: false; status: number; error: string };
type ValidationOk = { ok: true };

const INVALID_WORKFLOW_INSTANCE_ID = 'Invalid workflowInstanceId';

/* ------------------------------------------------------------------ */
/*  Project-scope helpers                                               */
/* ------------------------------------------------------------------ */

/** Lists all project IDs the user can access in n8n (personal + project relations). */
export async function listProjectIdsAccessibleToUser(
  projectRepository: ProjectRepository,
  projectRelationRepository: ProjectRelationRepository,
  userId: string,
): Promise<string[]> {
  const relations = await projectRelationRepository.findAllByUser(userId);
  const ids = new Set<string>(relations.map((r) => r.projectId));
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  if (personal?.id) ids.add(personal.id);
  return [...ids];
}

/**
 * Extracts the role slug from whatever shape n8n's findProjectRole returns.
 * n8n's findProjectRole uses findOneBy (no relation loading), so the `role` column
 * value is returned directly as a string (the slug), not a Role entity.
 */
export function extractRoleSlug(role: unknown): string | null {
  // Direct string — the raw column value (most common case)
  if (typeof role === 'string') {
    return role;
  }
  if (!role || typeof role !== 'object') {
    return null;
  }
  const record = role as Record<string, unknown>;
  // Object with slug property (Role entity if relation was loaded)
  if (typeof record.slug === 'string') {
    return record.slug;
  }
  // Nested role.slug (defensive)
  if (record.role && typeof record.role === 'object') {
    const nested = record.role as Record<string, unknown>;
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
export async function getViewerProjectRole(
  projectRepository: ProjectRepository,
  projectRelationRepository: ProjectRelationRepository,
  userId: string,
  projectId: string,
): Promise<string | null> {
  const role = await projectRelationRepository.findProjectRole({ userId, projectId });
  const roleSlug = extractRoleSlug(role);
  if (roleSlug) return roleSlug;
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  return personal?.id === projectId ? PROJECT_ROLE_PERSONAL_OWNER : null;
}

/**
 * n8n project access: project relation row (team / shared) or personal project owner.
 */
export async function verifyCallerHasN8nProjectAccess(
  projectRepository: ProjectRepository,
  projectRelationRepository: ProjectRelationRepository,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const role = await projectRelationRepository.findProjectRole({ userId, projectId });
  if (role) return true;
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  return personal?.id === projectId;
}

/**
 * Projects that own the workflow in n8n (`SharedWorkflow`), filtered to those also allowed for this
 * tenant/user. Create handlers use the first id in the result as `projectId`.
 */
export async function resolveWorkflowProjectScope(
  workflowId: string,
  allowedProjectIds: string[],
  sharedWorkflowRepository: SharedWorkflowRepository,
): Promise<string[]> {
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
export async function validateN8nExecutionMatchesWorkflow(params: {
  executionRepository: ExecutionRepository;
  workflowInstanceId: string;
  workflowId: string;
}): Promise<ValidationOk | ValidationFail> {
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
export async function validateN8nExecutionInTenantScope(params: {
  executionRepository: ExecutionRepository;
  workflowInstanceId: string;
  allowedProjectIds: string[];
  sharedWorkflowRepository: SharedWorkflowRepository;
}): Promise<ValidationOk | ValidationFail> {
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
export function requireChwfAllowedProjectIds(
  res: Response,
  routeLabel: string,
  logDomain: 'messages' | 'actions' | 'triggers',
): string[] {
  const allowed = res.locals.chwfAllowedProjectIds;
  if (!allowed?.length) {
    log.warn('Missing tenant/user scoped projects', {
      domain: logDomain,
      route: routeLabel,
      statusCode: 403,
    });
    throw new AppError(403, 'Missing tenant project scope');
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
export async function resolveProjectIdForCreate(params: {
  executionRepository: ExecutionRepository;
  sharedWorkflowRepository: SharedWorkflowRepository;
  workflowInstanceId: string;
  workflowId: string;
  allowedProjectIds: string[];
  logLabel: string;
}): Promise<string> {
  try {
    const execCheck = await validateN8nExecutionMatchesWorkflow({
      executionRepository: params.executionRepository,
      workflowInstanceId: params.workflowInstanceId,
      workflowId: params.workflowId,
    });
    if (execCheck.ok === false) {
      throw new AppError(execCheck.status, execCheck.error);
    }

    const scopedWorkflowProjects = await resolveWorkflowProjectScope(
      params.workflowId,
      params.allowedProjectIds,
      params.sharedWorkflowRepository,
    );
    if (!scopedWorkflowProjects.length) {
      throw new AppError(403, 'workflowId is not accessible for this tenant/user scope');
    }
    return scopedWorkflowProjects[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    const dbDetail = formatDbErrorForLog(error);
    log.error(`${params.logLabel} resolution error`, { statusCode: 500, dbDetail, error: String(error) });
    throw new AppError(500, 'Internal Server Error');
  }
}

/**
 * For GET list filters: when `workflowInstanceId` is provided, validates that the execution exists
 * and its workflow intersects the caller's tenant/project scope. Throws `AppError` on failure.
 * No-ops when `workflowInstanceId` is `undefined`.
 */
export async function requireExecutionInTenantScope(params: {
  executionRepository: ExecutionRepository;
  workflowInstanceId: string | undefined;
  allowedProjectIds: string[];
  sharedWorkflowRepository: SharedWorkflowRepository;
}): Promise<void> {
  if (!params.workflowInstanceId) return;
  const scopeCheck = await validateN8nExecutionInTenantScope({
    executionRepository: params.executionRepository,
    workflowInstanceId: params.workflowInstanceId,
    allowedProjectIds: params.allowedProjectIds,
    sharedWorkflowRepository: params.sharedWorkflowRepository,
  });
  if (scopeCheck.ok === false) {
    throw new AppError(scopeCheck.status, scopeCheck.error);
  }
}
