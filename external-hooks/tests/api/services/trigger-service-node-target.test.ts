import { describe, expect, it, vi } from 'vitest';
import { TriggerService } from '../../../src/api/services/trigger.service';
import { AppError } from '../../../src/api/utils/errors';
import { makeWorkflowTriggerRow } from '../../helpers/mocks';

const live = {
  ok: true,
  target: { inputSchema: [{ name: 'amount', type: 'number' }] },
  published: {},
};

function setup(resolve: unknown = live) {
  const create = vi.fn().mockImplementation(async (input) => makeWorkflowTriggerRow(input));
  const update = vi.fn().mockImplementation(async (input) => makeWorkflowTriggerRow(input));
  const getById = vi.fn().mockResolvedValue(makeWorkflowTriggerRow());
  const targets = { resolve: vi.fn().mockResolvedValue(resolve) };
  const service = new TriggerService(
    { workflowTrigger: { create, update, getById } } as any,
    { applyCredentialToTriggerMetadata: vi.fn() } as any,
    targets as any,
  );
  return { service, create, update, targets };
}

const base = {
  projectId: 'proj-1',
  allowedProjectIds: ['proj-1', 'proj-2'],
  triggerType: 'button',
  targetKind: 'n8n-node',
  targetWorkflowId: 'wf1',
  targetNodeId: 'node1',
  metadata: { buttonText: 'Go', inputValues: { amount: 5 } },
  allowedActorsType: 'all',
  allowedActors: ['*'],
  n8nUser: null,
};

describe('TriggerService n8n-node targets', () => {
  it('validates against the tenant projects and stores only workflow + node ids', async () => {
    const { service, create, targets } = setup();
    await service.create(base);

    expect(targets.resolve).toHaveBeenCalledWith({
      workflowId: 'wf1',
      nodeId: 'node1',
      projectIds: ['proj-1', 'proj-2'],
      source: 'button',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetKind: 'n8n-node',
        targetWorkflowId: 'wf1',
        targetNodeId: 'node1',
        triggerUrl: null,
        triggerMethod: null,
      }),
    );
  });

  it('rejects an unavailable target with 422 and the reason', async () => {
    const { service, create } = setup({ ok: false, reason: 'missing-node' });
    const error = await service.create(base).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 422, details: { reason: 'missing-node' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects button input values of the wrong type with 422', async () => {
    const { service } = setup();
    const error = await service
      .create({ ...base, metadata: { buttonText: 'Go', inputValues: { amount: 'lots' } } })
      .catch((e) => e);
    expect(error).toMatchObject({ statusCode: 422, details: { errors: ['"amount" must be of type number'] } });
  });

  it('requires the target ids', async () => {
    const { service } = setup();
    const error = await service.create({ ...base, targetNodeId: undefined }).catch((e) => e);
    expect(error).toMatchObject({ statusCode: 422 });
  });

  it('requires a URL and method for legacy triggers', async () => {
    const { service } = setup();
    const error = await service.create({ ...base, targetKind: 'url' }).catch((e) => e);
    expect(error).toMatchObject({ statusCode: 422 });
  });

  it('keeps legacy URL creation working without a target service', async () => {
    const create = vi.fn().mockImplementation(async (input) => makeWorkflowTriggerRow(input));
    const service = new TriggerService({ workflowTrigger: { create } } as any, {} as any);
    await service.create({
      ...base,
      targetKind: 'url',
      triggerUrl: 'https://example.com/hook',
      triggerMethod: 'POST',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ targetKind: 'url', triggerUrl: 'https://example.com/hook', targetWorkflowId: null }),
    );
  });

  it('re-validates on update against the existing trigger type', async () => {
    const { service, update, targets } = setup();
    await service.update({
      triggerId: 'trigger-001',
      projectIds: ['proj-1'],
      targetKind: 'n8n-node',
      targetWorkflowId: 'wf2',
      targetNodeId: 'node2',
      metadata: { buttonText: 'Go' },
      allowedActorsType: 'all',
      allowedActors: ['*'],
      authEnabled: false,
      updatedBy: 'u',
      n8nUser: null,
    });
    expect(targets.resolve).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'wf2', source: 'button' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ targetWorkflowId: 'wf2', targetNodeId: 'node2' }));
  });
});
