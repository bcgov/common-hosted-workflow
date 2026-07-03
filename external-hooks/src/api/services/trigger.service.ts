import { inArray } from 'drizzle-orm';
import { workflowTrigger } from '../../db/schema/workflow-trigger';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import { encrypt, decrypt } from '../utils/secret-box';
import { WIL_ENCRYPTION_KEY, WIL_ENCRYPTION_KEY_ACTIVE, CHEFS_API_KEY_PLACEHOLDER } from '@config';
import { WorkflowTriggerTypeEnum } from '../constants/enum';
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
};

export type DeleteTriggerParams = {
  triggerId: string;
  projectIds: string[];
};

export class TriggerService {
  constructor(private readonly customRepositories: CustomRepositories) {}

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
    const apiKey = isChefsForm ? extractChefsApiKey(params.metadata) : null;
    const cleanMetadata = isChefsForm ? stripApiKey(params.metadata) : params.metadata;

    try {
      const trigger = await this.customRepositories.workflowTrigger.create({
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

      if (isChefsForm && apiKey) {
        await this.persistChefsCredential(trigger.id, apiKey);
      }

      return trigger;
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
    const apiKey = isChefsForm ? extractChefsApiKey(params.metadata) : null;
    const cleanMetadata = isChefsForm ? stripApiKey(params.metadata) : params.metadata;

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

      if (isChefsForm && apiKey) {
        await this.persistChefsCredential(params.triggerId, apiKey);
      }

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

    if (existing.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM) {
      const relations = await this.customRepositories.triggerCredentialRelation.listByTriggerId(params.triggerId);
      for (const relation of relations) {
        await this.customRepositories.triggerCredentialRelation.deleteById({
          triggerId: params.triggerId,
          credentialId: relation.credentialId,
        });
        await this.customRepositories.credentialEntity.deleteById({ credentialId: relation.credentialId });
      }
    }

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

  async getChefsApiKeyForTrigger(triggerId: string): Promise<string> {
    if (!WIL_ENCRYPTION_KEY) {
      throw new AppError(500, 'Encryption key not configured');
    }

    const credential = await this.customRepositories.triggerCredentialRelation.findLinkedCredentialByTriggerIdAndType({
      triggerId,
      type: 'chefs_api_key',
    });

    if (!credential) {
      throw new AppError(400, 'No CHEFS API key credential found for this trigger');
    }

    return decrypt(credential.data as string, WIL_ENCRYPTION_KEY);
  }

  private async persistChefsCredential(triggerId: string, apiKey: string): Promise<void> {
    if (!WIL_ENCRYPTION_KEY) {
      log.warn('WIL_ENCRYPTION_KEY not configured — CHEFS API key will not be stored');
      return;
    }

    const encrypted = encrypt(apiKey, WIL_ENCRYPTION_KEY);

    const existing = await this.customRepositories.triggerCredentialRelation.findLinkedCredentialByTriggerIdAndType({
      triggerId,
      type: 'chefs_api_key',
    });

    const credential = await this.customRepositories.credentialEntity.upsert({
      id: existing?.id,
      name: 'CHEFS API Key',
      type: 'chefs_api_key',
      data: encrypted,
      keyVersion: WIL_ENCRYPTION_KEY_ACTIVE,
    });

    if (!existing) {
      await this.customRepositories.triggerCredentialRelation.upsert({
        triggerId,
        credentialId: credential.id,
      });
    }
  }
}

function extractChefsApiKey(metadata: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(metadata)) {
    if (
      key.toLowerCase() === 'apikey' &&
      typeof value === 'string' &&
      value.length > 0 &&
      value !== CHEFS_API_KEY_PLACEHOLDER
    ) {
      return value;
    }
  }
  return null;
}

function stripApiKey(metadata: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.toLowerCase() !== 'apikey') {
      result[key] = value;
    }
  }
  return result;
}
