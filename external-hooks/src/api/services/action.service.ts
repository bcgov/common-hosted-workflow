import { eq, inArray } from 'drizzle-orm';
import { actionRequest } from '../../db/schema/workflow-interaction-layer';
import { buildPaginationClauses } from '../../db/repository/custom/pagination';
import { formatDbErrorForLog, normalizeCreateActionTimestamps } from '../helpers/db-helper';
import { requireExecutionInTenantScope, resolveProjectIdForCreate } from './project-access';
import { buildActorMatcherClause } from './actor-matcher-clause';
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
  status: string;
};

export class ActionService {
  constructor(
    private readonly n8nRepositories: N8nRepositories,
    private readonly customRepositories: CustomRepositories,
  ) {}

  private buildListWhere(params: {
    allowedProjectIds: string[];
    actorId?: string;
    actorMatchers?: ActorMatchers;
    workflowInstanceId?: string;
    since?: ListPaginationSince;
    status?: string[];
  }): any[] {
    const clauses: any[] = [inArray(actionRequest.projectId, params.allowedProjectIds)];
    if (params.actorMatchers) {
      clauses.push(buildActorMatcherClause(actionRequest, params.actorMatchers));
    } else if (params.actorId) {
      clauses.push(eq(actionRequest.actorId, params.actorId));
    }
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
    const row = await this.customRepositories.actionRequest.getById({
      actionId: params.actionId,
      where: [
        inArray(actionRequest.projectId, params.allowedProjectIds),
        ...(params.actorMatchers
          ? [buildActorMatcherClause(actionRequest, params.actorMatchers)]
          : params.actorId
            ? [eq(actionRequest.actorId, params.actorId)]
            : []),
      ],
    });
    if (!row) throw new AppError(404, 'Action not found');
    return row;
  }

  async updateStatus(params: UpdateActionStatusParams) {
    const row = await this.customRepositories.actionRequest.updateStatus({
      actionId: params.actionId,
      status: params.status,
      where: [
        inArray(actionRequest.projectId, params.allowedProjectIds),
        ...(params.actorMatchers
          ? [buildActorMatcherClause(actionRequest, params.actorMatchers)]
          : params.actorId
            ? [eq(actionRequest.actorId, params.actorId)]
            : []),
      ],
    });
    if (!row) throw new AppError(404, 'Action not found');
    return params.status;
  }
}
