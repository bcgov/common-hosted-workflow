'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ActionService = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const workflow_interaction_layer_1 = require('../../db/schema/workflow-interaction-layer');
const pagination_1 = require('../../db/repository/custom/pagination');
const db_helper_1 = require('../helpers/db-helper');
const project_access_1 = require('./project-access');
const actor_matcher_clause_1 = require('./actor-matcher-clause');
const action_state_machine_1 = require('./action-state-machine');
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const string_1 = require('../utils/string');
const log = (0, logger_1.createLogger)('CustomAPIs');
class ActionService {
  n8nRepositories;
  customRepositories;
  constructor(n8nRepositories, customRepositories) {
    this.n8nRepositories = n8nRepositories;
    this.customRepositories = customRepositories;
  }
  buildActorWhere(params) {
    if (params.actorMatchers) {
      return [
        (0, actor_matcher_clause_1.buildActorMatcherClause)(
          workflow_interaction_layer_1.actionRequest,
          params.actorMatchers,
        ),
      ];
    } else if (params.actorId) {
      return [(0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.actorId, params.actorId)];
    }
    return [];
  }
  /**
   * Builds the extra DB columns to set alongside a status change:
   * - completion audit fields when transitioning to `completed`
   * - a `cancellationReason` merged into existing metadata when supplied
   *
   * Returns `undefined` when there is nothing extra to set.
   */
  buildStatusUpdateFields(params, current) {
    const fields = {};
    if (params.status === action_state_machine_1.ACTION_STATUS_COMPLETED) {
      fields.completedBy = params.actorEmail;
      fields.completedAt = new Date();
    }
    if (params.cancellationReason) {
      const existingMetadata = current.metadata ?? {};
      fields.metadata = { ...existingMetadata, cancellationReason: params.cancellationReason };
    }
    return Object.keys(fields).length > 0 ? fields : undefined;
  }
  buildListWhere(params) {
    const clauses = [
      (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.projectId, params.allowedProjectIds),
      ...this.buildActorWhere(params),
    ];
    if (params.workflowInstanceId)
      clauses.push(
        (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.workflowInstanceId, params.workflowInstanceId),
      );
    if (params.status && params.status.length > 0)
      clauses.push((0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.status, params.status));
    clauses.push(...(0, pagination_1.buildPaginationClauses)(workflow_interaction_layer_1.actionRequest, params.since));
    return clauses;
  }
  async create(params) {
    const { dueDate, checkIn } = (0, db_helper_1.normalizeCreateActionTimestamps)(params);
    const callbackMethod = params.callbackMethod ?? 'POST';
    const callbackUrl = callbackMethod === 'NONE' ? '' : (params.callbackUrl ?? '');
    const projectId = await (0, project_access_1.resolveProjectIdForCreate)({
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
      const dbDetail = (0, db_helper_1.formatDbErrorForLog)(error);
      log.error('Create action error', {
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
  async getById(params) {
    const actorWhereClauses = this.buildActorWhere(params);
    const row = await this.customRepositories.actionRequest.getById({
      actionId: params.actionId,
      where: [
        (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.projectId, params.allowedProjectIds),
        ...actorWhereClauses,
      ],
    });
    if (!row) throw new errors_1.AppError(404, 'Action not found');
    return row;
  }
  async countByStatus(params) {
    const clauses = [
      (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.projectId, params.allowedProjectIds),
    ];
    if (params.actorMatchers) {
      clauses.push(
        (0, actor_matcher_clause_1.buildActorMatcherClause)(
          workflow_interaction_layer_1.actionRequest,
          params.actorMatchers,
        ),
      );
    }
    return await this.customRepositories.actionRequest.countByStatus({ where: clauses });
  }
  async updateStatus(params) {
    const actorWhereClauses = this.buildActorWhere(params);
    const scopeClauses = [
      (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.projectId, params.allowedProjectIds),
      ...actorWhereClauses,
    ];
    // 1. Use pre-fetched action if provided, otherwise fetch from DB
    const current =
      params.currentAction ??
      (await this.customRepositories.actionRequest.getById({
        actionId: params.actionId,
        where: scopeClauses,
      }));
    if (!current) throw new errors_1.AppError(404, 'Action not found');
    // 2. Validate transition is allowed
    if (!(0, action_state_machine_1.isValidTransition)(current.status, params.status)) {
      throw new errors_1.AppError(409, `Invalid state transition from ${current.status} to ${params.status}`);
    }
    // 3. For role/group actions transitioning to completed: validate caller = claimed_by
    if (
      params.status === action_state_machine_1.ACTION_STATUS_COMPLETED &&
      (0, action_state_machine_1.isSharedActorType)(current.actorType)
    ) {
      if (params.actorEmail !== current.claimedBy) {
        throw new errors_1.AppError(403, 'Only the claiming actor can complete this action');
      }
    }
    // 4. Build additional fields for completion / cancellation reason
    const additionalFields = this.buildStatusUpdateFields(params, current);
    // 5. Update with optimistic locking on current status
    const row = await this.customRepositories.actionRequest.updateStatus({
      actionId: params.actionId,
      status: params.status,
      expectedStatus: current.status,
      additionalFields,
      where: scopeClauses,
    });
    if (!row) throw new errors_1.AppError(409, 'Action state changed concurrently');
    return row;
  }
  async directUpdate(params) {
    const whereClauses = [
      (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.projectId, params.allowedProjectIds),
    ];
    if (params.actorId) {
      whereClauses.push((0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.actorId, params.actorId));
    }
    const row = await this.customRepositories.actionRequest.directUpdate({
      actionId: params.actionId,
      setValues: params.setValues,
      where: whereClauses,
    });
    if (!row) throw new errors_1.AppError(404, 'Action not found');
    return row;
  }
}
exports.ActionService = ActionService;
