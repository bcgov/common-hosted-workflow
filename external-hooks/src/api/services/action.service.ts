import { eq, inArray } from 'drizzle-orm';
import { actionRequest, type ActionRequest } from '../../db/schema/workflow-interaction-layer';
import { buildPaginationClauses } from '../../db/repository/custom/pagination';
import { formatDbErrorForLog, normalizeCreateActionTimestamps } from '../helpers/db-helper';
import { requireExecutionInTenantScope, resolveProjectIdForCreate } from './project-access';
import { buildActorMatcherClause } from './actor-matcher-clause';
import { ACTION_STATUS_COMPLETED, isSharedActorType, isValidTransition } from './action-state-machine';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { ListPaginationSince } from '../types/list-pagination';
import type { ActorMatchers } from '../types/actor-matchers';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { shortenIdForLog } from '../utils/string';

const log = createLogger('CustomAPIs');

export type ActionServiceDependencies = {
  n8nRepositories: N8nRepositories;
  customRepositories: CustomRepositories;
};

export type CreateActionParams = {
  allowedProjectIds: string[];
  actionType: string;
  actionTitle?: string | null;
  payload: Record<string, unknown>;
  callbackUrl?: string;
  callbackMethod?: string;
  callbackPayloadSpec?: Record<string, unknown> | null;
  actorId: string;
  actorType: string;
  workflowInstanceId: string;
  workflowId: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  checkIn?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ListActionsParams = {
  allowedProjectIds: string[];
  actorId?: string;
  actorMatchers?: ActorMatchers;
  workflowInstanceId?: string;
  limit: number;
  since?: ListPaginationSince;
  status?: string[];
};

export type GetActionByIdParams = {
  allowedProjectIds: string[];
  actionId: string;
  actorId?: string;
  actorMatchers?: ActorMatchers;
};

export type UpdateActionStatusParams = {
  allowedProjectIds: string[];
  actionId: string;
  actorId?: string;
  actorMatchers?: ActorMatchers;
  actorEmail?: string;
  status: string;
  /** Pre-fetched action row — skips the internal getById when provided. */
  currentAction?: ActionRequest;
};

export type DirectUpdateParams = {
  allowedProjectIds: string[];
  actionId: string;
  actorId?: string;
  setValues: {
    status?: string;
    claimedBy?: string | null;
    claimedAt?: Date | null;
    completedBy?: string | null;
    completedAt?: Date | null;
    updatedAt: Date;
  };
};

export class ActionService {
  constructor(
    private readonly n8nRepositories: N8nRepositories,
    private readonly customRepositories: CustomRepositories,
  ) {}

  private buildActorWhere(params: { actorId?: string; actorMatchers?: ActorMatchers }): any[] {
    if (params.actorMatchers) {
      return [buildActorMatcherClause(actionRequest, params.actorMatchers)];
    } else if (params.actorId) {
      return [eq(actionRequest.actorId, params.actorId)];
    }
    return [];
  }

  private buildListWhere(params: {
    allowedProjectIds: string[];
    actorId?: string;
    actorMatchers?: ActorMatchers;
    workflowInstanceId?: string;
    since?: ListPaginationSince;
    status?: string[];
  }): any[] {
    const clauses: any[] = [
      inArray(actionRequest.projectId, params.allowedProjectIds),
      ...this.buildActorWhere(params),
    ];
    if (params.workflowInstanceId) clauses.push(eq(actionRequest.workflowInstanceId, params.workflowInstanceId));
    if (params.status && params.status.length > 0) clauses.push(inArray(actionRequest.status, params.status));
    clauses.push(...buildPaginationClauses(actionRequest, params.since));
    return clauses;
  }

  async create(params: CreateActionParams) {
    const { dueDate, checkIn } = normalizeCreateActionTimestamps(params);
    const callbackMethod = params.callbackMethod ?? 'POST';
    const callbackUrl = callbackMethod === 'NONE' ? '' : (params.callbackUrl ?? '');

    const projectId = await resolveProjectIdForCreate({
      executionRepository: this.n8nRepositories.execution,
      sharedWorkflowRepository: this.n8nRepositories.sharedWorkflow,
      workflowInstanceId: params.workflowInstanceId,
      workflowId: params.workflowId,
      allowedProjectIds: params.allowedProjectIds,
      logLabel: 'Create action',
    });

    try {
      return await this.customRepositories.actionRequest.create({
        actionType: params.actionType,
        actionTitle: params.actionTitle ?? null,
        payload: params.payload,
        callbackUrl,
        callbackMethod,
        callbackPayloadSpec: params.callbackPayloadSpec ?? null,
        actorId: params.actorId,
        actorType: params.actorType,
        workflowInstanceId: params.workflowInstanceId,
        workflowId: params.workflowId,
        projectId,
        status: params.status ?? 'pending',
        priority: params.priority ?? 'normal',
        dueDate,
        checkIn,
        metadata: params.metadata ?? null,
      });
    } catch (error) {
      const dbDetail = formatDbErrorForLog(error);
      log.error('Create action error', {
        statusCode: 500,
        projectId: shortenIdForLog(projectId),
        workflowId: shortenIdForLog(params.workflowId),
        dbDetail,
        error: String(error),
      });
      throw new AppError(500, 'Internal Server Error');
    }
  }

  async list(params: ListActionsParams) {
    await requireExecutionInTenantScope({
      executionRepository: this.n8nRepositories.execution,
      workflowInstanceId: params.workflowInstanceId,
      allowedProjectIds: params.allowedProjectIds,
      sharedWorkflowRepository: this.n8nRepositories.sharedWorkflow,
    });

    return await this.customRepositories.actionRequest.list({
      where: this.buildListWhere({
        allowedProjectIds: params.allowedProjectIds,
        actorId: params.actorId,
        actorMatchers: params.actorMatchers,
        workflowInstanceId: params.workflowInstanceId,
        since: params.since,
        status: params.status,
      }),
      limit: params.limit,
    });
  }

  async getById(params: GetActionByIdParams) {
    const actorWhereClauses = this.buildActorWhere(params);

    const row = await this.customRepositories.actionRequest.getById({
      actionId: params.actionId,
      where: [inArray(actionRequest.projectId, params.allowedProjectIds), ...actorWhereClauses],
    });
    if (!row) throw new AppError(404, 'Action not found');
    return row;
  }

  async countByStatus(params: {
    allowedProjectIds: string[];
    actorMatchers?: ActorMatchers;
  }): Promise<Record<string, number>> {
    const clauses: any[] = [inArray(actionRequest.projectId, params.allowedProjectIds)];
    if (params.actorMatchers) {
      clauses.push(buildActorMatcherClause(actionRequest, params.actorMatchers));
    }
    return await this.customRepositories.actionRequest.countByStatus({ where: clauses });
  }

  async updateStatus(params: UpdateActionStatusParams) {
    const actorWhereClauses = this.buildActorWhere(params);
    const scopeClauses = [inArray(actionRequest.projectId, params.allowedProjectIds), ...actorWhereClauses];

    // 1. Use pre-fetched action if provided, otherwise fetch from DB
    const current =
      params.currentAction ??
      (await this.customRepositories.actionRequest.getById({
        actionId: params.actionId,
        where: scopeClauses,
      }));
    if (!current) throw new AppError(404, 'Action not found');

    // 2. Validate transition is allowed
    if (!isValidTransition(current.status, params.status)) {
      throw new AppError(409, `Invalid state transition from ${current.status} to ${params.status}`);
    }

    // 3. For role/group actions transitioning to completed: validate caller = claimed_by
    if (params.status === ACTION_STATUS_COMPLETED && isSharedActorType(current.actorType)) {
      if (params.actorEmail !== current.claimedBy) {
        throw new AppError(403, 'Only the claiming actor can complete this action');
      }
    }

    // 4. Build additional fields for completion
    const additionalFields =
      params.status === ACTION_STATUS_COMPLETED
        ? { completedBy: params.actorEmail, completedAt: new Date() }
        : undefined;

    // 5. Update with optimistic locking on current status
    const row = await this.customRepositories.actionRequest.updateStatus({
      actionId: params.actionId,
      status: params.status,
      expectedStatus: current.status,
      additionalFields,
      where: scopeClauses,
    });

    if (!row) throw new AppError(409, 'Action state changed concurrently');
    return row;
  }

  async directUpdate(params: DirectUpdateParams) {
    const whereClauses = [inArray(actionRequest.projectId, params.allowedProjectIds)];
    if (params.actorId) {
      whereClauses.push(eq(actionRequest.actorId, params.actorId));
    }
    const row = await this.customRepositories.actionRequest.directUpdate({
      actionId: params.actionId,
      setValues: params.setValues,
      where: whereClauses,
    });
    if (!row) throw new AppError(404, 'Action not found');
    return row;
  }
}
