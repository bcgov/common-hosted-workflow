import { inArray } from 'drizzle-orm';
import { workflowTrigger } from '../../db/schema/workflow-trigger';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import { WorkflowTriggerTypeEnum } from '../constants/enum';
import type { ChefsService } from './chefs.service';
import type { N8nUserEntity } from './n8n-credentials.service';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { formatDbErrorForLog } from '../helpers/db-helper';
import { shortenIdForLog } from '../utils/string';

const log = createLogger('TriggerService');

export type ListTriggersParams = {
  projectIds: string[];
  limit?: number;
};

export type GetTriggerByIdParams = {
  triggerId: string;
  projectIds: string[];
};

export type CreateTriggerParams = {
  projectId: string;
  triggerType: string;
  triggerUrl: string;
  triggerMethod: string;
  metadata: Record<string, unknown>;
  allowedActorsType: string;
  allowedActors: string[];
  authEnabled?: boolean;
  createdBy?: string | null;
  /** Signed-in n8n user; n8n must grant them credential:read on a referenced CHEFS credential. */
  n8nUser: N8nUserEntity | null;
};

export type UpdateTriggerParams = {
  triggerId: string;
  projectIds: string[];
  triggerUrl: string;
  triggerMethod: string;
  metadata: Record<string, unknown>;
  allowedActorsType: string;
  allowedActors: string[];
  authEnabled: boolean;
  updatedBy: string;
  /** Signed-in n8n user; n8n must grant them credential:read on a referenced CHEFS credential. */
  n8nUser: N8nUserEntity | null;
};

export type DeleteTriggerParams = {
  triggerId: string;
  projectIds: string[];
};

export class TriggerService {
  constructor(
    private readonly customRepositories: CustomRepositories,
    private readonly chefs: ChefsService,
  ) {}

  async list(params: ListTriggersParams) {
    return await this.customRepositories.workflowTrigger.list({
      where: [inArray(workflowTrigger.projectId, params.projectIds)],
      limit: params.limit ?? 100,
    });
  }

  async getById(params: GetTriggerByIdParams) {
    const row = await this.customRepositories.workflowTrigger.getById({
      triggerId: params.triggerId,
      where: [inArray(workflowTrigger.projectId, params.projectIds)],
    });
    if (!row) throw new AppError(404, 'Trigger not found');
    return row;
  }

  async create(params: CreateTriggerParams) {
    const isChefsForm = params.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM;
    const cleanMetadata = isChefsForm
      ? await this.chefs.applyCredentialToTriggerMetadata(params.metadata, [params.projectId], params.n8nUser)
      : params.metadata;

    try {
      return await this.customRepositories.workflowTrigger.create({
        projectId: params.projectId,
        triggerType: params.triggerType,
        triggerUrl: params.triggerUrl,
        triggerMethod: params.triggerMethod,
        metadata: cleanMetadata,
        allowedActorsType: params.allowedActorsType,
        allowedActors: params.allowedActors,
        authEnabled: params.authEnabled ?? false,
        createdBy: params.createdBy ?? null,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      const dbDetail = formatDbErrorForLog(error);
      log.error('Create trigger error', {
        statusCode: 500,
        projectId: shortenIdForLog(params.projectId),
        dbDetail,
        error: String(error),
      });
      throw new AppError(500, 'Internal Server Error');
    }
  }

  async update(params: UpdateTriggerParams) {
    const existing = await this.customRepositories.workflowTrigger.getById({
      triggerId: params.triggerId,
      where: [inArray(workflowTrigger.projectId, params.projectIds)],
    });
    if (!existing) throw new AppError(404, 'Trigger not found');

    const isChefsForm = existing.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM;
    const cleanMetadata = isChefsForm
      ? await this.chefs.applyCredentialToTriggerMetadata(params.metadata, [existing.projectId], params.n8nUser)
      : params.metadata;

    try {
      const updated = await this.customRepositories.workflowTrigger.update({
        triggerId: params.triggerId,
        triggerUrl: params.triggerUrl,
        triggerMethod: params.triggerMethod,
        metadata: cleanMetadata,
        allowedActorsType: params.allowedActorsType,
        allowedActors: params.allowedActors,
        authEnabled: params.authEnabled,
        updatedBy: params.updatedBy,
        where: [inArray(workflowTrigger.projectId, params.projectIds)],
      });
      if (!updated) throw new AppError(404, 'Trigger not found');

      return updated;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const dbDetail = formatDbErrorForLog(error);
      log.error('Update trigger error', {
        statusCode: 500,
        triggerId: shortenIdForLog(params.triggerId),
        dbDetail,
        error: String(error),
      });
      throw new AppError(500, 'Internal Server Error');
    }
  }

  async delete(params: DeleteTriggerParams) {
    const existing = await this.customRepositories.workflowTrigger.getById({
      triggerId: params.triggerId,
      where: [inArray(workflowTrigger.projectId, params.projectIds)],
    });
    if (!existing) throw new AppError(404, 'Trigger not found');

    try {
      const deleted = await this.customRepositories.workflowTrigger.deleteById({
        triggerId: params.triggerId,
        where: [inArray(workflowTrigger.projectId, params.projectIds)],
      });
      if (!deleted) throw new AppError(404, 'Trigger not found');
      return deleted;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const dbDetail = formatDbErrorForLog(error);
      log.error('Delete trigger error', {
        statusCode: 500,
        triggerId: shortenIdForLog(params.triggerId),
        dbDetail,
        error: String(error),
      });
      throw new AppError(500, 'Internal Server Error');
    }
  }
}
