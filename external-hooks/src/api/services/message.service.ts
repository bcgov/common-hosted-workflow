import { and, eq, inArray } from 'drizzle-orm';
import { messages } from '../../db/schema/workflow-interaction-layer';
import { buildPaginationClauses } from '../../db/repository/custom/pagination';
import { formatDbErrorForLog } from '../helpers/db-helper';
import { requireExecutionInTenantScope, resolveProjectIdForCreate } from '../helpers/n8n-validation';
import type { N8nExecutionLookup } from '../helpers/n8n-validation';
import type { BaseN8nSharedWorkflowRepository } from '../types/n8n-adapters';
import type { MessageRepository } from '../../db/repository/custom/message';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { shortenIdForLog } from '../utils/string';

const log = createLogger('CustomAPIs');

export type MessageServiceDependencies = {
  messageRepository: MessageRepository;
  executionRepository: N8nExecutionLookup;
  sharedWorkflowRepository: BaseN8nSharedWorkflowRepository;
};

export type CreateMessageParams = {
  allowedProjectIds: string[];
  title: string;
  body: string;
  actorId: string;
  actorType: string;
  workflowInstanceId: string;
  workflowId: string;
  metadata?: Record<string, unknown> | null;
  status?: string;
};

export type ListMessagesParams = {
  allowedProjectIds: string[];
  actorId?: string;
  workflowInstanceId?: string;
  limit: number;
  since?: import('../../types/list-pagination').ListPaginationSince;
};

export class MessageService {
  private readonly messageRepository: MessageRepository;
  private readonly executionRepository: N8nExecutionLookup;
  private readonly sharedWorkflowRepository: N8nSharedWorkflowRepository;

  constructor(deps: MessageServiceDependencies) {
    this.messageRepository = deps.messageRepository;
    this.executionRepository = deps.executionRepository;
    this.sharedWorkflowRepository = deps.sharedWorkflowRepository;
  }

  private buildListWhere(params: {
    allowedProjectIds: string[];
    actorId?: string;
    workflowInstanceId?: string;
    since?: import('../../types/list-pagination').ListPaginationSince;
  }): any[] {
    const clauses: any[] = [inArray(messages.projectId, params.allowedProjectIds)];
    if (params.actorId) clauses.push(eq(messages.actorId, params.actorId));
    if (params.workflowInstanceId) clauses.push(eq(messages.workflowInstanceId, params.workflowInstanceId));
    clauses.push(...buildPaginationClauses(messages, params.since));
    return clauses;
  }

  async create(params: CreateMessageParams) {
    const projectId = await resolveProjectIdForCreate({
      executionRepository: this.executionRepository,
      sharedWorkflowRepository: this.sharedWorkflowRepository,
      workflowInstanceId: params.workflowInstanceId,
      workflowId: params.workflowId,
      allowedProjectIds: params.allowedProjectIds,
      logLabel: 'Create message',
    });

    try {
      return await this.messageRepository.create({
        title: params.title,
        body: params.body,
        actorId: params.actorId,
        actorType: params.actorType,
        workflowInstanceId: params.workflowInstanceId,
        workflowId: params.workflowId,
        projectId,
        metadata: params.metadata ?? null,
        status: params.status || 'active',
      });
    } catch (error) {
      const dbDetail = formatDbErrorForLog(error);
      log.error('Create message error', {
        statusCode: 500,
        projectId: shortenIdForLog(projectId),
        workflowId: shortenIdForLog(params.workflowId),
        dbDetail,
        error: String(error),
      });
      throw new AppError(500, 'Internal Server Error');
    }
  }

  async list(params: ListMessagesParams) {
    await requireExecutionInTenantScope({
      executionRepository: this.executionRepository,
      workflowInstanceId: params.workflowInstanceId,
      allowedProjectIds: params.allowedProjectIds,
      sharedWorkflowRepository: this.sharedWorkflowRepository,
    });

    return await this.messageRepository.list({
      where: this.buildListWhere(params),
      limit: params.limit,
    });
  }
}
