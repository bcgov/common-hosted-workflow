import { inArray } from 'drizzle-orm';
import { workflowTrigger } from '../../db/schema/workflow-trigger';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import { encrypt, decrypt } from '../utils/secret-box';
import {
  WIL_ENCRYPTION_KEY,
  WIL_ENCRYPTION_KEY_ACTIVE,
  CHEFS_API_KEY_PLACEHOLDER,
  WIL_N8N_NODE_TRIGGERS_ENABLED,
} from '@config';
import { TriggerTargetKindEnum, WorkflowTriggerTypeEnum, type WilTriggerSource } from '../constants/enum';
import { validateWilInput } from '../helpers/wil-trigger-node';
import type { TriggerTargetService } from './trigger-target.service';
import type { ChefsService } from './chefs.service';
import { readN8nCredentialId } from './chefs.service';
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

/** Where a trigger sends its run: a legacy URL (default) or a WIL Trigger node in a published n8n workflow. */
export type TriggerTargetParams = {
  targetKind?: string;
  targetWorkflowId?: string;
  targetNodeId?: string;
  triggerUrl?: string;
  triggerMethod?: string;
};

export type CreateTriggerParams = TriggerTargetParams & {
  projectId: string;
  /** Tenant projects an n8n-node target may live in (defaults to `[projectId]`). */
  allowedProjectIds?: string[];
  triggerType: string;
  metadata: Record<string, unknown>;
  allowedActorsType: string;
  allowedActors: string[];
  authEnabled?: boolean;
  createdBy?: string | null;
  /** Signed-in n8n user; n8n must grant them credential:read on a referenced CHEFS credential. */
  n8nUser: N8nUserEntity | null;
};

export type UpdateTriggerParams = TriggerTargetParams & {
  triggerId: string;
  projectIds: string[];
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
    private readonly targets?: TriggerTargetService,
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
    const metadata = isChefsForm
      ? await this.chefs.applyCredentialToTriggerMetadata(params.metadata, [params.projectId], params.n8nUser)
      : params.metadata;
    const apiKey = isChefsForm ? extractChefsApiKey(metadata) : null;
    if (isChefsForm && apiKey) requireEncryptionKey();
    const cleanMetadata = isChefsForm ? stripApiKey(metadata) : metadata;
    const target = await this.resolveTargetColumns(
      params,
      params.allowedProjectIds ?? [params.projectId],
      params.triggerType as WilTriggerSource,
      cleanMetadata,
    );

    try {
      const trigger = await this.customRepositories.workflowTrigger.create({
        projectId: params.projectId,
        triggerType: params.triggerType,
        ...target,
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
    const metadata = isChefsForm
      ? await this.chefs.applyCredentialToTriggerMetadata(params.metadata, [existing.projectId], params.n8nUser)
      : params.metadata;
    const apiKey = isChefsForm ? extractChefsApiKey(metadata) : null;
    if (isChefsForm && apiKey) requireEncryptionKey();
    const cleanMetadata = isChefsForm ? stripApiKey(metadata) : metadata;
    const target = await this.resolveTargetColumns(
      params,
      params.projectIds,
      existing.triggerType as WilTriggerSource,
      cleanMetadata,
    );

    try {
      const updated = await this.customRepositories.workflowTrigger.update({
        triggerId: params.triggerId,
        ...target,
        metadata: cleanMetadata,
        allowedActorsType: params.allowedActorsType,
        allowedActors: params.allowedActors,
        authEnabled: params.authEnabled,
        updatedBy: params.updatedBy,
        where: [inArray(workflowTrigger.projectId, params.projectIds)],
      });
      if (!updated) throw new AppError(404, 'Trigger not found');

      if (isChefsForm && readN8nCredentialId(cleanMetadata)) {
        await this.deletePrivateChefsCredentials(params.triggerId);
      } else if (isChefsForm && apiKey) {
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
      await this.deletePrivateChefsCredentials(params.triggerId);
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
    const key = requireEncryptionKey();

    const credential = await this.customRepositories.triggerCredentialRelation.findLinkedCredentialByTriggerIdAndType({
      triggerId,
      type: 'chefs_api_key',
    });

    if (!credential) {
      throw new AppError(400, 'No CHEFS API key credential found for this trigger');
    }

    return decrypt(credential.data as string, key);
  }

  /**
   * Validates the requested target and returns the DB columns for it.
   * n8n-node targets must be live (published, in a tenant project, node present) and accept this trigger type.
   */
  private async resolveTargetColumns(
    params: TriggerTargetParams,
    projectIds: string[],
    source: WilTriggerSource,
    metadata: Record<string, unknown>,
  ) {
    if (params.targetKind !== TriggerTargetKindEnum.N8N_NODE) {
      if (!params.triggerUrl || !params.triggerMethod) {
        throw new AppError(422, 'triggerUrl and triggerMethod are required for URL triggers');
      }
      return {
        targetKind: TriggerTargetKindEnum.URL,
        triggerUrl: params.triggerUrl,
        triggerMethod: params.triggerMethod,
        targetWorkflowId: null,
        targetNodeId: null,
      };
    }

    if (!WIL_N8N_NODE_TRIGGERS_ENABLED || !this.targets) {
      throw new AppError(400, 'n8n node triggers are disabled');
    }
    if (!params.targetWorkflowId || !params.targetNodeId) {
      throw new AppError(422, 'targetWorkflowId and targetNodeId are required for n8n-node triggers');
    }

    const resolved = await this.targets.resolve({
      workflowId: params.targetWorkflowId,
      nodeId: params.targetNodeId,
      projectIds,
      source,
    });
    if (!resolved.ok) {
      throw new AppError(422, 'Target workflow node is not available for this trigger', { reason: resolved.reason });
    }

    // Button input values are checked against the node's declared schema at save time.
    if (source === WorkflowTriggerTypeEnum.BUTTON) {
      const errors = validateWilInput(resolved.target.inputSchema, metadata.inputValues);
      if (errors.length > 0) throw new AppError(422, 'Invalid input values', { errors });
    }

    return {
      targetKind: TriggerTargetKindEnum.N8N_NODE,
      triggerUrl: null,
      triggerMethod: null,
      targetWorkflowId: params.targetWorkflowId,
      targetNodeId: params.targetNodeId,
    };
  }

  private async deletePrivateChefsCredentials(triggerId: string): Promise<void> {
    const relations = await this.customRepositories.triggerCredentialRelation.listByTriggerId(triggerId);
    if (relations.length === 0) return;
    const credentialIds = relations.map((relation) => relation.credentialId);
    await this.customRepositories.triggerCredentialRelation.deleteByAssociatedTriggerId(triggerId);
    await this.customRepositories.credentialEntity.deleteByAssociatedTriggerId(credentialIds);
  }

  private async persistChefsCredential(triggerId: string, apiKey: string): Promise<void> {
    const key = requireEncryptionKey();

    const encrypted = encrypt(apiKey, key);

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

function requireEncryptionKey(): string {
  if (!WIL_ENCRYPTION_KEY) {
    throw new AppError(500, 'Encryption key not configured');
  }
  return WIL_ENCRYPTION_KEY;
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
