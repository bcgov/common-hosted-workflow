'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * A CHEFS trigger resolves its form details from an n8n credential; the private
 * API key is never stored. These tests pin the credential-binding behaviour.
 */
const vitest_1 = require('vitest');
const trigger_service_1 = require('../../../src/api/services/trigger.service');
const enum_1 = require('../../../src/api/constants/enum');
function createService(metadata) {
  const getById = vitest_1.vi.fn().mockResolvedValue({
    id: 'trig-1',
    projectId: 'proj-1',
    triggerType: enum_1.WorkflowTriggerTypeEnum.CHEFS_FORM,
  });
  const update = vitest_1.vi.fn().mockResolvedValue({
    id: 'trig-1',
    triggerType: enum_1.WorkflowTriggerTypeEnum.CHEFS_FORM,
    metadata,
  });
  const create = vitest_1.vi.fn().mockResolvedValue({
    id: 'trig-1',
    projectId: 'proj-1',
    triggerType: enum_1.WorkflowTriggerTypeEnum.CHEFS_FORM,
    metadata,
  });
  const applyCredentialToTriggerMetadata = vitest_1.vi.fn(async (value) => value);
  const targets = {
    resolve: vitest_1.vi.fn().mockResolvedValue({ ok: true, target: { inputSchema: [] }, published: {} }),
  };
  const service = new trigger_service_1.TriggerService(
    {
      workflowTrigger: { getById, update, create },
    },
    { applyCredentialToTriggerMetadata },
    targets,
  );
  return { service, applyCredentialToTriggerMetadata };
}
const baseUpdate = {
  triggerId: 'trig-1',
  // Tenant-wide list: the credential must still be resolved against the trigger's own project only.
  projectIds: ['proj-1', 'proj-2'],
  targetKind: 'n8n-node',
  targetWorkflowId: 'wf1',
  targetNodeId: 'node1',
  allowedActorsType: 'all',
  allowedActors: ['*'],
  authEnabled: false,
  updatedBy: 'user@example.com',
  n8nUser: null,
};
(0, vitest_1.describe)('TriggerService CHEFS credential reference', () => {
  (0, vitest_1.it)('passes the n8n user to credential binding on update', async () => {
    const metadata = { n8nCredentialId: 'cred-1' };
    const { service, applyCredentialToTriggerMetadata } = createService(metadata);
    const n8nUser = { id: 'user-1', role: { slug: 'global:member' } };
    await service.update({ ...baseUpdate, metadata, n8nUser });
    (0, vitest_1.expect)(applyCredentialToTriggerMetadata).toHaveBeenCalledWith(metadata, ['proj-1'], n8nUser);
  });
  (0, vitest_1.it)("binds a credential on create against the new trigger's own project only", async () => {
    const metadata = { n8nCredentialId: 'cred-1' };
    const { service, applyCredentialToTriggerMetadata } = createService(metadata);
    const n8nUser = { id: 'user-1', role: { slug: 'global:member' } };
    await service.create({
      projectId: 'proj-1',
      triggerType: enum_1.WorkflowTriggerTypeEnum.CHEFS_FORM,
      targetKind: 'n8n-node',
      targetWorkflowId: 'wf1',
      targetNodeId: 'node1',
      metadata,
      allowedActorsType: 'all',
      allowedActors: ['*'],
      n8nUser,
    });
    (0, vitest_1.expect)(applyCredentialToTriggerMetadata).toHaveBeenCalledWith(metadata, ['proj-1'], n8nUser);
  });
});
