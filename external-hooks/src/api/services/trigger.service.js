'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TriggerService = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const workflow_trigger_1 = require('../../db/schema/workflow-trigger');
const _config_1 = require('@config');
const enum_1 = require('../constants/enum');
const wil_trigger_node_1 = require('../helpers/wil-trigger-node');
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const db_helper_1 = require('../helpers/db-helper');
const string_1 = require('../utils/string');
const log = (0, logger_1.createLogger)('TriggerService');
class TriggerService {
  customRepositories;
  chefs;
  targets;
  constructor(customRepositories, chefs, targets) {
    this.customRepositories = customRepositories;
    this.chefs = chefs;
    this.targets = targets;
  }
  async list(params) {
    return await this.customRepositories.workflowTrigger.list({
      where: [(0, drizzle_orm_1.inArray)(workflow_trigger_1.workflowTrigger.projectId, params.projectIds)],
      limit: params.limit ?? 100,
    });
  }
  async getById(params) {
    const row = await this.customRepositories.workflowTrigger.getById({
      triggerId: params.triggerId,
      where: [(0, drizzle_orm_1.inArray)(workflow_trigger_1.workflowTrigger.projectId, params.projectIds)],
    });
    if (!row) throw new errors_1.AppError(404, 'Trigger not found');
    return row;
  }
  async create(params) {
    const isChefsForm = params.triggerType === enum_1.WorkflowTriggerTypeEnum.CHEFS_FORM;
    const cleanMetadata = isChefsForm
      ? await this.chefs.applyCredentialToTriggerMetadata(params.metadata, [params.projectId], params.n8nUser)
      : params.metadata;
    const target = await this.resolveTargetColumns(
      params,
      params.allowedProjectIds ?? [params.projectId],
      params.triggerType,
      cleanMetadata,
    );
    try {
      return await this.customRepositories.workflowTrigger.create({
        projectId: params.projectId,
        triggerType: params.triggerType,
        ...target,
        metadata: cleanMetadata,
        allowedActorsType: params.allowedActorsType,
        allowedActors: params.allowedActors,
        authEnabled: params.authEnabled ?? false,
        createdBy: params.createdBy ?? null,
      });
    } catch (error) {
      if (error instanceof errors_1.AppError) throw error;
      const dbDetail = (0, db_helper_1.formatDbErrorForLog)(error);
      log.error('Create trigger error', {
        statusCode: 500,
        projectId: (0, string_1.shortenIdForLog)(params.projectId),
        dbDetail,
        error: String(error),
      });
      throw new errors_1.AppError(500, 'Internal Server Error');
    }
  }
  async update(params) {
    const existing = await this.customRepositories.workflowTrigger.getById({
      triggerId: params.triggerId,
      where: [(0, drizzle_orm_1.inArray)(workflow_trigger_1.workflowTrigger.projectId, params.projectIds)],
    });
    if (!existing) throw new errors_1.AppError(404, 'Trigger not found');
    const isChefsForm = existing.triggerType === enum_1.WorkflowTriggerTypeEnum.CHEFS_FORM;
    const cleanMetadata = isChefsForm
      ? await this.chefs.applyCredentialToTriggerMetadata(params.metadata, [existing.projectId], params.n8nUser)
      : params.metadata;
    const target = await this.resolveTargetColumns(params, params.projectIds, existing.triggerType, cleanMetadata);
    try {
      const updated = await this.customRepositories.workflowTrigger.update({
        triggerId: params.triggerId,
        ...target,
        metadata: cleanMetadata,
        allowedActorsType: params.allowedActorsType,
        allowedActors: params.allowedActors,
        authEnabled: params.authEnabled,
        updatedBy: params.updatedBy,
        where: [(0, drizzle_orm_1.inArray)(workflow_trigger_1.workflowTrigger.projectId, params.projectIds)],
      });
      if (!updated) throw new errors_1.AppError(404, 'Trigger not found');
      return updated;
    } catch (error) {
      if (error instanceof errors_1.AppError) throw error;
      const dbDetail = (0, db_helper_1.formatDbErrorForLog)(error);
      log.error('Update trigger error', {
        statusCode: 500,
        triggerId: (0, string_1.shortenIdForLog)(params.triggerId),
        dbDetail,
        error: String(error),
      });
      throw new errors_1.AppError(500, 'Internal Server Error');
    }
  }
  async delete(params) {
    const existing = await this.customRepositories.workflowTrigger.getById({
      triggerId: params.triggerId,
      where: [(0, drizzle_orm_1.inArray)(workflow_trigger_1.workflowTrigger.projectId, params.projectIds)],
    });
    if (!existing) throw new errors_1.AppError(404, 'Trigger not found');
    try {
      const deleted = await this.customRepositories.workflowTrigger.deleteById({
        triggerId: params.triggerId,
        where: [(0, drizzle_orm_1.inArray)(workflow_trigger_1.workflowTrigger.projectId, params.projectIds)],
      });
      if (!deleted) throw new errors_1.AppError(404, 'Trigger not found');
      return deleted;
    } catch (error) {
      if (error instanceof errors_1.AppError) throw error;
      const dbDetail = (0, db_helper_1.formatDbErrorForLog)(error);
      log.error('Delete trigger error', {
        statusCode: 500,
        triggerId: (0, string_1.shortenIdForLog)(params.triggerId),
        dbDetail,
        error: String(error),
      });
      throw new errors_1.AppError(500, 'Internal Server Error');
    }
  }
  /**
   * Validates the requested target and returns the DB columns for it.
   * n8n-node targets must be live (published, in a tenant project, node present) and accept this trigger type.
   */
  async resolveTargetColumns(params, projectIds, source, metadata) {
    if (!_config_1.WIL_N8N_NODE_TRIGGERS_ENABLED || !this.targets) {
      throw new errors_1.AppError(400, 'n8n node triggers are disabled');
    }
    if (!params.targetWorkflowId || !params.targetNodeId) {
      throw new errors_1.AppError(422, 'targetWorkflowId and targetNodeId are required for n8n-node triggers');
    }
    const resolved = await this.targets.resolve({
      workflowId: params.targetWorkflowId,
      nodeId: params.targetNodeId,
      projectIds,
      source,
    });
    if (!resolved.ok) {
      throw new errors_1.AppError(422, 'Target workflow node is not available for this trigger', {
        reason: resolved.reason,
      });
    }
    // Button input values are checked against the node's declared schema at save time.
    if (source === enum_1.WorkflowTriggerTypeEnum.BUTTON) {
      const errors = (0, wil_trigger_node_1.validateWilInput)(resolved.target.inputSchema, metadata.inputValues);
      if (errors.length > 0) throw new errors_1.AppError(422, 'Invalid input values', { errors });
    }
    return {
      targetKind: enum_1.TriggerTargetKindEnum.N8N_NODE,
      targetWorkflowId: params.targetWorkflowId,
      targetNodeId: params.targetNodeId,
    };
  }
}
exports.TriggerService = TriggerService;
