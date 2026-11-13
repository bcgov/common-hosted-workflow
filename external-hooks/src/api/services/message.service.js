'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.MessageService = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const workflow_interaction_layer_1 = require('../../db/schema/workflow-interaction-layer');
const pagination_1 = require('../../db/repository/custom/pagination');
const db_helper_1 = require('../helpers/db-helper');
const project_access_1 = require('./project-access');
const actor_matcher_clause_1 = require('./actor-matcher-clause');
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const string_1 = require('../utils/string');
const log = (0, logger_1.createLogger)('CustomAPIs');
class MessageService {
  n8nRepositories;
  customRepositories;
  constructor(n8nRepositories, customRepositories) {
    this.n8nRepositories = n8nRepositories;
    this.customRepositories = customRepositories;
  }
  buildListWhere(params) {
    const clauses = [
      (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.message.projectId, params.allowedProjectIds),
    ];
    if (params.actorMatchers) {
      clauses.push(
        (0, actor_matcher_clause_1.buildActorMatcherClause)(workflow_interaction_layer_1.message, params.actorMatchers),
      );
    } else if (params.actorId) {
      clauses.push((0, drizzle_orm_1.eq)(workflow_interaction_layer_1.message.actorId, params.actorId));
    }
    if (params.workflowInstanceId)
      clauses.push(
        (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.message.workflowInstanceId, params.workflowInstanceId),
      );
    clauses.push(...(0, pagination_1.buildPaginationClauses)(workflow_interaction_layer_1.message, params.since));
    return clauses;
  }
  async create(params) {
    const projectId = await (0, project_access_1.resolveProjectIdForCreate)({
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
      const dbDetail = (0, db_helper_1.formatDbErrorForLog)(error);
      log.error('Create message error', {
        statusCode: 500,
        projectId: (0, string_1.shortenIdForLog)(projectId),
        workflowId: (0, string_1.shortenIdForLog)(params.workflowId),
        dbDetail,
        error: String(error),
      });
      throw new errors_1.AppError(500, 'Internal Server Error');
    }
  }
  async list(params) {
    await (0, project_access_1.requireExecutionInTenantScope)({
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
exports.MessageService = MessageService;
