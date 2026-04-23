/**
 * n8n-related access and validation helpers: caller project access, workflow/execution scope,
 * and execution id checks for the workflow interaction layer (messages, action requests).
 */

import type { Response } from 'express';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { formatDbErrorForLog } from './db-helper';

const log = createLogger('CustomAPIs');

/** Subset of n8n `ExecutionRepository` used to resolve `workflowInstanceId` (execution id). */
export type N8nExecutionLookup = {
  findSingleExecution: (
    id: string,
    options?: { includeData?: boolean; unflattenData?: boolean },
  ) => Promise<{ workflowId: string } | null | undefined>;
};

type ValidationFail = { ok: false; status: number; error: string };
type ValidationOk = { ok: true };

const INVALID_WORKFLOW_INSTANCE_ID = 'Invalid workflowInstanceId';

/**
 * Loads execution metadata, or `null` if not found or if `findSingleExecution` throws
 * (e.g. Postgres `22P02` for malformed ids).
 */
async function loadN8nExecutionMetadataOrNull(
  executionRepository: N8nExecutionLookup,
  workflowInstanceId: string,
): Promise<{ workflowId: string } | null> {
  try {
    const execution = await executionRepository.findSingleExecution(workflowInstanceId, {
      includeData: false,
      unflattenData: false,
    });
    return execution ?? null;
  } catch {
    return null;
  }
}

/**
 * n8n project access: project relation row (team / shared) or personal project owner.
 */
export async function verifyCallerHasN8nProjectAccess(
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

/** Lists all project IDs the user can access in n8n (personal + project relations). */
export async function listN8nProjectIdsAccessibleToUser(
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
 * Projects that own the workflow in n8n (`SharedWorkflow`), filtered to those also allowed for this
 * tenant/user. Create handlers use the first id in the result as `projectId`.
 */
export async function resolveWorkflowProjectScope(
  workflowId: string,
  allowedProjectIds: string[],
  sharedWorkflowRepository: { findProjectIds: (id: string) => Promise<string[]> },
): Promise<string[]> {
  const workflowProjectIds = await sharedWorkflowRepository.findProjectIds(workflowId);
  const allowedSet = new Set(allowedProjectIds);
  return workflowProjectIds.filter((id) => allowedSet.has(id));
}

/**
 * Ensures the n8n execution row exists and matches the claimed `workflowId` (stops spoofed instance ids).
 */
export async function validateN8nExecutionMatchesWorkflow(params: {
  executionRepository: N8nExecutionLookup;
  workflowInstanceId: string;
  workflowId: string;
}): Promise<ValidationOk | ValidationFail> {
  const execution = await loadN8nExecutionMetadataOrNull(params.executionRepository, params.workflowInstanceId);
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
  executionRepository: N8nExecutionLookup;
  workflowInstanceId: string;
  allowedProjectIds: string[];
  sharedWorkflowRepository: { findProjectIds: (id: string) => Promise<string[]> };
}): Promise<ValidationOk | ValidationFail> {
  const execution = await loadN8nExecutionMetadataOrNull(params.executionRepository, params.workflowInstanceId);
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
  logDomain: 'messages' | 'actions',
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
  executionRepository: N8nExecutionLookup;
  sharedWorkflowRepository: { findProjectIds: (id: string) => Promise<string[]> };
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
  executionRepository: N8nExecutionLookup;
  workflowInstanceId: string | undefined;
  allowedProjectIds: string[];
  sharedWorkflowRepository: { findProjectIds: (id: string) => Promise<string[]> };
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
