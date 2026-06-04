import { and, eq, inArray } from 'drizzle-orm';
import { actionRequests } from '../../db/schema/workflow-interaction-layer';
import { buildPaginationClauses } from '../../db/repository/custom/pagination';
import { formatDbErrorForLog, normalizeCreateActionTimestamps } from '../helpers/db-helper';
import { requireExecutionInTenantScope, resolveProjectIdForCreate } from '../helpers/n8n-validation';
import type { N8nExecutionLookup } from '../helpers/n8n-validation';
import type { BaseN8nSharedWorkflowRepository } from '../types/n8n-adapters';
import type { ActionRequestRepository } from '../../db/repository/custom/action-request';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { shortenIdForLog } from '../utils/string';

const log = createLogger('CustomAPIs');

export type ActionServiceDependencies = {
  actionRequestRepository: ActionRequestRepository;
  executionRepository: N8nExecutionLookup;
  sharedWorkflowRepository: BaseN8nSharedWorkflowRepository;
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
  workflowInstanceId?: string;
  limit: number;
  since?: import('../../types/list-pagination').ListPaginationSince;
};

export type GetActionByIdParams = {
  allowedProjectIds: string[];
  actionId: string;
  actorId?: string;
};

export type UpdateActionStatusParams = {
  allowedProjectIds: string[];
  actionId: string;
  actorId?: string;
  status: string;
};

export class ActionService {
  private readonly actionRequestRepository: ActionRequestRepository;
  private readonly executionRepository: N8nExecutionLookup;
  private readonly sharedWorkflowRepository: N8nSharedWorkflowRepository;

  constructor(deps: ActionServiceDependencies) {
    this.actionRequestRepository = deps.actionRequestRepository;
    this.executionRepository = deps.executionRepository;
    this.sharedWorkflowRepository = deps.sharedWorkflowRepository;
  }

  private buildListWhere(params: {
    allowedProjectIds: string[];
    actorId?: string;
    workflowInstanceId?: string;
    since?: import('../../types/list-pagination').ListPaginationSince;
  }): any[] {
    const clauses: any[] = [inArray(actionRequests.projectId, params.allowedProjectIds)];
    if (params.actorId) clauses.push(eq(actionRequests.actorId, params.actorId));
    if (params.workflowInstanceId) clauses.push(eq(actionRequests.workflowInstanceId, params.workflowInstanceId));
    clauses.push(...buildPaginationClauses(actionRequests, params.since));
    return clauses;
  }

  async create(params: CreateActionParams) {
    const { dueDate, checkIn } = normalizeCreateActionTimestamps(params);
    const callbackMethod = params.callbackMethod ?? 'POST';
    const callbackUrl = callbackMethod === 'NONE' ? '' : (params.callbackUrl ?? '');

    const projectId = await resolveProjectIdForCreate({
      executionRepository: this.executionRepository,
      sharedWorkflowRepository: this.sharedWorkflowRepository,
      workflowInstanceId: params.workflowInstanceId,
      workflowId: params.workflowId,
      allowedProjectIds: params.allowedProjectIds,
      logLabel: 'Create action',
    });

    try {
      return await this.actionRequestRepository.create({
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
      executionRepository: this.executionRepository,
      workflowInstanceId: params.workflowInstanceId,
      allowedProjectIds: params.allowedProjectIds,
      sharedWorkflowRepository: this.sharedWorkflowRepository,
    });

    return await this.actionRequestRepository.list({
      where: this.buildListWhere(params),
      limit: params.limit,
    });
  }

  async getById(params: GetActionByIdParams) {
    const row = await this.actionRequestRepository.getById({
      actionId: params.actionId,
      where: [
        inArray(actionRequests.projectId, params.allowedProjectIds),
        ...(params.actorId ? [eq(actionRequests.actorId, params.actorId)] : []),
      ],
    });
    if (!row) throw new AppError(404, 'Action not found');
    return row;
  }

  async updateStatus(params: UpdateActionStatusParams) {
    const row = await this.actionRequestRepository.updateStatus({
      actionId: params.actionId,
      status: params.status,
      where: [
        inArray(actionRequests.projectId, params.allowedProjectIds),
        ...(params.actorId ? [eq(actionRequests.actorId, params.actorId)] : []),
      ],
    });
    if (!row) throw new AppError(404, 'Action not found');
    return params.status;
  }
}
