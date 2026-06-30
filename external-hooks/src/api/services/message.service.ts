import { eq, inArray } from 'drizzle-orm';
import { message } from '../../db/schema/workflow-interaction-layer';
import { buildPaginationClauses } from '../../db/repository/custom/pagination';
import { formatDbErrorForLog } from '../helpers/db-helper';
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

export type MessageServiceDependencies = {
  n8nRepositories: N8nRepositories;
  customRepositories: CustomRepositories;
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
  actorMatchers?: ActorMatchers;
  workflowInstanceId?: string;
  limit: number;
  since?: ListPaginationSince;
};

export class MessageService {
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
  }): any[] {
    const clauses: any[] = [inArray(message.projectId, params.allowedProjectIds)];
    if (params.actorMatchers) {
      clauses.push(buildActorMatcherClause(message, params.actorMatchers));
    } else if (params.actorId) {
      clauses.push(eq(message.actorId, params.actorId));
    }
    if (params.workflowInstanceId) clauses.push(eq(message.workflowInstanceId, params.workflowInstanceId));
    clauses.push(...buildPaginationClauses(message, params.since));
    return clauses;
  }

  async create(params: CreateMessageParams) {
    const projectId = await resolveProjectIdForCreate({
      executionRepository: this.n8nRepositories.execution,
      sharedWorkflowRepository: this.n8nRepositories.sharedWorkflow,
      workflowInstanceId: params.workflowInstanceId,
      workflowId: params.workflowId,
      allowedProjectIds: params.allowedProjectIds,
      logLabel: 'Create message',
    });

    try {
      return await this.customRepositories.message.create({
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
      executionRepository: this.n8nRepositories.execution,
      workflowInstanceId: params.workflowInstanceId,
      allowedProjectIds: params.allowedProjectIds,
      sharedWorkflowRepository: this.n8nRepositories.sharedWorkflow,
    });

    return await this.customRepositories.message.list({
      where: this.buildListWhere(params),
      limit: params.limit,
    });
  }
}
