/**
 * A CHEFS trigger that references an n8n credential must not keep the legacy private API key.
 */
import { describe, expect, it, vi } from 'vitest';

import { TriggerService } from '../../../src/api/services/trigger.service';
import { WorkflowTriggerTypeEnum } from '../../../src/api/constants/enum';

function createService(metadata: Record<string, unknown>) {
  const listByTriggerId = vi.fn().mockResolvedValue([{ credentialId: 'private-cred' }]);
  const deleteRelation = vi.fn().mockResolvedValue(undefined);
  const deleteCredentials = vi.fn().mockResolvedValue(undefined);
  const upsert = vi.fn();
  const getById = vi.fn().mockResolvedValue({
    id: 'trig-1',
    triggerType: WorkflowTriggerTypeEnum.CHEFS_FORM,
  });
  const update = vi.fn().mockResolvedValue({
    id: 'trig-1',
    triggerType: WorkflowTriggerTypeEnum.CHEFS_FORM,
    metadata,
  });
  const applyCredentialToTriggerMetadata = vi.fn(async (value: Record<string, unknown>) => value);

  const service = new TriggerService(
    {
      workflowTrigger: { getById, update },
      triggerCredentialRelation: { listByTriggerId, deleteByAssociatedTriggerId: deleteRelation, upsert: vi.fn() },
      credentialEntity: { deleteByAssociatedTriggerId: deleteCredentials, upsert },
    } as any,
    { applyCredentialToTriggerMetadata } as any,
  );

  return { service, deleteRelation, deleteCredentials, upsert, applyCredentialToTriggerMetadata };
}

const baseUpdate = {
  triggerId: 'trig-1',
  projectIds: ['proj-1'],
  triggerUrl: 'https://example.com/hook',
  triggerMethod: 'POST',
  allowedActorsType: 'all',
  allowedActors: ['*'],
  authEnabled: false,
  updatedBy: 'user@example.com',
};

describe('TriggerService.update CHEFS credential reference', () => {
  it('deletes the legacy private key when the trigger selects an n8n credential', async () => {
    const metadata = { n8nCredentialId: 'cred-1', formId: 'form-123', formName: 'Intake' };
    const { service, deleteRelation, deleteCredentials, upsert } = createService(metadata);

    await service.update({ ...baseUpdate, metadata });

    expect(deleteRelation).toHaveBeenCalledWith('trig-1');
    expect(deleteCredentials).toHaveBeenCalledWith(['private-cred']);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('keeps the legacy private key when no n8n credential is selected', async () => {
    const metadata = { formId: 'form-123', formName: 'Intake', apiKey: '__CHWF_BLANK_VALUE_chefs-api-key__' }; // pragma: allowlist secret
    const { service, deleteRelation, upsert } = createService(metadata);

    await service.update({ ...baseUpdate, metadata });

    expect(deleteRelation).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
