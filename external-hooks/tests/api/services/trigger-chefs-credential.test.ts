/**
 * A CHEFS trigger resolves its form details from an n8n credential; the private
 * API key is never stored. These tests pin the credential-binding behaviour.
 */
import { describe, expect, it, vi } from 'vitest';

import { TriggerService } from '../../../src/api/services/trigger.service';
import { WorkflowTriggerTypeEnum } from '../../../src/api/constants/enum';

function createService(metadata: Record<string, unknown>) {
  const getById = vi.fn().mockResolvedValue({
    id: 'trig-1',
    projectId: 'proj-1',
    triggerType: WorkflowTriggerTypeEnum.CHEFS_FORM,
  });
  const update = vi.fn().mockResolvedValue({
    id: 'trig-1',
    triggerType: WorkflowTriggerTypeEnum.CHEFS_FORM,
    metadata,
  });
  const create = vi.fn().mockResolvedValue({
    id: 'trig-1',
    projectId: 'proj-1',
    triggerType: WorkflowTriggerTypeEnum.CHEFS_FORM,
    metadata,
  });
  const applyCredentialToTriggerMetadata = vi.fn(async (value: Record<string, unknown>) => value);

  const service = new TriggerService(
    {
      workflowTrigger: { getById, update, create },
    } as any,
    { applyCredentialToTriggerMetadata } as any,
  );

  return { service, applyCredentialToTriggerMetadata };
}

const baseUpdate = {
  triggerId: 'trig-1',
  // Tenant-wide list: the credential must still be resolved against the trigger's own project only.
  projectIds: ['proj-1', 'proj-2'],
  triggerUrl: 'https://example.com/hook',
  triggerMethod: 'POST',
  allowedActorsType: 'all',
  allowedActors: ['*'],
  authEnabled: false,
  updatedBy: 'user@example.com',
  n8nUser: null,
};

describe('TriggerService CHEFS credential reference', () => {
  it('passes the n8n user to credential binding on update', async () => {
    const metadata = { n8nCredentialId: 'cred-1' };
    const { service, applyCredentialToTriggerMetadata } = createService(metadata);
    const n8nUser = { id: 'user-1', role: { slug: 'global:member' } };

    await service.update({ ...baseUpdate, metadata, n8nUser });

    expect(applyCredentialToTriggerMetadata).toHaveBeenCalledWith(metadata, ['proj-1'], n8nUser);
  });

  it("binds a credential on create against the new trigger's own project only", async () => {
    const metadata = { n8nCredentialId: 'cred-1' };
    const { service, applyCredentialToTriggerMetadata } = createService(metadata);
    const n8nUser = { id: 'user-1', role: { slug: 'global:member' } };

    await service.create({
      projectId: 'proj-1',
      triggerType: WorkflowTriggerTypeEnum.CHEFS_FORM,
      triggerUrl: 'https://example.com/hook',
      triggerMethod: 'POST',
      metadata,
      allowedActorsType: 'all',
      allowedActors: ['*'],
      n8nUser,
    });

    expect(applyCredentialToTriggerMetadata).toHaveBeenCalledWith(metadata, ['proj-1'], n8nUser);
  });
});
