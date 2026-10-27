import { describe, expect, it, vi } from 'vitest';
import { TriggerTargetService } from '../../../src/api/services/trigger-target.service';

const wilNode = (id: string, parameters: Record<string, unknown> = {}) => ({
  id,
  name: `Node ${id}`,
  type: 'community-nodes.wilTrigger',
  parameters,
});

function setup(rows: Array<{ workflowId: string; workflowName: string; projectId: string; nodes: unknown }>) {
  const findPublishedWithNodeType = vi.fn().mockResolvedValue(rows);
  const loadPublished = vi.fn();
  const service = new TriggerTargetService(
    { sharedWorkflow: { findPublishedWithNodeType } } as any,
    { usesPublicationService: false, loadPublished } as any,
  );
  return { service, findPublishedWithNodeType, loadPublished };
}

describe('TriggerTargetService.list', () => {
  it('flattens nodes, filters by accepted source and sorts by label', async () => {
    const { service } = setup([
      {
        workflowId: 'wf1',
        workflowName: 'B flow',
        projectId: 'p1',
        nodes: [
          wilNode('n2', { displayLabel: 'Zeta' }),
          wilNode('n1', { displayLabel: 'Alpha', acceptedSources: ['button'] }),
        ],
      },
    ]);
    const all = await service.list({ projectIds: ['p1'] });
    expect(all.map((t) => t.label)).toEqual(['Alpha', 'Zeta']);
    const forms = await service.list({ projectIds: ['p1'], source: 'chefs-form' });
    expect(forms.map((t) => t.nodeId)).toEqual(['n2']);
  });
});

describe('TriggerTargetService.resolve', () => {
  const published = (nodes: unknown[], projectId = 'p1') => ({ workflow: { name: 'Flow', nodes }, projectId });

  it.each([
    ['unpublished', null, ['p1'], 'n1'],
    ['wrong-project', published([wilNode('n1')], 'other'), ['p1'], 'n1'],
    ['missing-node', published([wilNode('n1')]), ['p1'], 'gone'],
  ])('rejects with %s', async (reason, loaded, projectIds, nodeId) => {
    const { service, loadPublished } = setup([]);
    loadPublished.mockResolvedValue(loaded);
    expect(await service.resolve({ workflowId: 'wf1', nodeId, projectIds })).toEqual({ ok: false, reason });
  });

  it('rejects a source the node does not accept', async () => {
    const { service, loadPublished } = setup([]);
    loadPublished.mockResolvedValue(published([wilNode('n1', { acceptedSources: ['button'] })]));
    expect(
      await service.resolve({ workflowId: 'wf1', nodeId: 'n1', projectIds: ['p1'], source: 'chefs-form' }),
    ).toEqual({
      ok: false,
      reason: 'source-not-accepted',
    });
  });

  it('resolves a live node', async () => {
    const { service, loadPublished } = setup([]);
    loadPublished.mockResolvedValue(published([wilNode('n1')]));
    const result = await service.resolve({ workflowId: 'wf1', nodeId: 'n1', projectIds: ['p1'], source: 'button' });
    expect(result).toMatchObject({ ok: true, target: { workflowId: 'wf1', nodeId: 'n1', workflowName: 'Flow' } });
  });
});

describe('TriggerTargetService.statuses', () => {
  it('uses one discovery query and classifies live / missing-node / unpublished', async () => {
    const { service, findPublishedWithNodeType } = setup([
      { workflowId: 'wf1', workflowName: 'A', projectId: 'p1', nodes: [wilNode('n1')] },
    ]);
    const ref = (id: string, wf: string | null, node: string | null) => ({
      id,
      targetWorkflowId: wf,
      targetNodeId: node,
    });
    const result = await service.statuses(
      [ref('a', 'wf1', 'n1'), ref('b', 'wf1', 'zz'), ref('c', 'wf9', 'n1'), ref('d', null, null)],
      ['p1'],
    );
    expect(Object.fromEntries(result)).toEqual({ a: 'live', b: 'missing-node', c: 'unpublished' });
    expect(findPublishedWithNodeType).toHaveBeenCalledTimes(1);
  });

  it('scopes discovery to every tenant project so a cross-project target reads live', async () => {
    // Target workflow is owned by p2, but the trigger row stored projectId p1 (allowedProjectIds[0]).
    const { service, findPublishedWithNodeType } = setup([
      { workflowId: 'wf1', workflowName: 'A', projectId: 'p2', nodes: [wilNode('n1')] },
    ]);
    const result = await service.statuses([{ id: 'a', targetWorkflowId: 'wf1', targetNodeId: 'n1' }], ['p1', 'p2']);
    expect(Object.fromEntries(result)).toEqual({ a: 'live' });
    expect(findPublishedWithNodeType).toHaveBeenCalledWith(expect.objectContaining({ projectIds: ['p1', 'p2'] }));
  });

  it('skips the query when no trigger has a target', async () => {
    const { service, findPublishedWithNodeType } = setup([]);
    await service.statuses([{ id: 'a', targetWorkflowId: null, targetNodeId: null }], ['p1']);
    expect(findPublishedWithNodeType).not.toHaveBeenCalled();
  });
});
