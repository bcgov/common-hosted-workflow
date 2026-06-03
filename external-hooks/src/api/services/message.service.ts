import { formatDbErrorForLog } from '../helpers/db-helper';
import { requireExecutionInTenantScope, resolveProjectIdForCreate } from '../helpers/n8n-validation';
import type { N8nExecutionLookup } from '../helpers/n8n-validation';
import type { N8nSharedWorkflowRepository } from '../types/n8n-adapters';
import type { MessageRepository } from '../../db/repository/workflow-interaction-layer/message';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { shortenIdForLog } from '../utils/string';

const log = createLogger('CustomAPIs');

export type MessageServiceDependencies = {
  messageRepository: MessageRepository;
  executionRepository: N8nExecutionLookup;
  sharedWorkflowRepository: N8nSharedWorkflowRepository;
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
      allowedProjectIds: params.allowedProjectIds,
      actorId: params.actorId,
      paginationSince: params.since,
      workflowInstanceId: params.workflowInstanceId,
      limit: params.limit,
    });
  }
}
