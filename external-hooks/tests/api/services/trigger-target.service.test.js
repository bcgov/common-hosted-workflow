"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const trigger_target_service_1 = require("../../../src/api/services/trigger-target.service");
const wilNode = (id, parameters = {}) => ({
    id,
    name: `Node ${id}`,
    type: 'community-nodes.wilTrigger',
    parameters,
});
function setup(rows) {
    const findPublishedWithNodeType = vitest_1.vi.fn().mockResolvedValue(rows);
    const loadPublished = vitest_1.vi.fn();
    const service = new trigger_target_service_1.TriggerTargetService({ sharedWorkflow: { findPublishedWithNodeType } }, { usesPublicationService: false, loadPublished });
    return { service, findPublishedWithNodeType, loadPublished };
}
(0, vitest_1.describe)('TriggerTargetService.list', () => {
    (0, vitest_1.it)('flattens nodes, filters by accepted source and sorts by label', async () => {
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
        (0, vitest_1.expect)(all.map((t) => t.label)).toEqual(['Alpha', 'Zeta']);
        const forms = await service.list({ projectIds: ['p1'], source: 'chefs-form' });
        (0, vitest_1.expect)(forms.map((t) => t.nodeId)).toEqual(['n2']);
    });
});
(0, vitest_1.describe)('TriggerTargetService.resolve', () => {
    const published = (nodes, projectId = 'p1') => ({ workflow: { name: 'Flow', nodes }, projectId });
    vitest_1.it.each([
        ['unpublished', null, ['p1'], 'n1'],
        ['wrong-project', published([wilNode('n1')], 'other'), ['p1'], 'n1'],
        ['missing-node', published([wilNode('n1')]), ['p1'], 'gone'],
    ])('rejects with %s', async (reason, loaded, projectIds, nodeId) => {
        const { service, loadPublished } = setup([]);
        loadPublished.mockResolvedValue(loaded);
        (0, vitest_1.expect)(await service.resolve({ workflowId: 'wf1', nodeId, projectIds })).toEqual({ ok: false, reason });
    });
    (0, vitest_1.it)('rejects a source the node does not accept', async () => {
        const { service, loadPublished } = setup([]);
        loadPublished.mockResolvedValue(published([wilNode('n1', { acceptedSources: ['button'] })]));
        (0, vitest_1.expect)(await service.resolve({ workflowId: 'wf1', nodeId: 'n1', projectIds: ['p1'], source: 'chefs-form' })).toEqual({
            ok: false,
            reason: 'source-not-accepted',
        });
    });
    (0, vitest_1.it)('resolves a live node', async () => {
        const { service, loadPublished } = setup([]);
        loadPublished.mockResolvedValue(published([wilNode('n1')]));
        const result = await service.resolve({ workflowId: 'wf1', nodeId: 'n1', projectIds: ['p1'], source: 'button' });
        (0, vitest_1.expect)(result).toMatchObject({ ok: true, target: { workflowId: 'wf1', nodeId: 'n1', workflowName: 'Flow' } });
    });
});
(0, vitest_1.describe)('TriggerTargetService.statuses', () => {
    (0, vitest_1.it)('uses one discovery query and classifies live / missing-node / unpublished', async () => {
        const { service, findPublishedWithNodeType } = setup([
            { workflowId: 'wf1', workflowName: 'A', projectId: 'p1', nodes: [wilNode('n1')] },
        ]);
        const ref = (id, wf, node) => ({
            id,
            targetWorkflowId: wf,
            targetNodeId: node,
        });
        const result = await service.statuses([ref('a', 'wf1', 'n1'), ref('b', 'wf1', 'zz'), ref('c', 'wf9', 'n1'), ref('d', null, null)], ['p1']);
        (0, vitest_1.expect)(Object.fromEntries(result)).toEqual({ a: 'live', b: 'missing-node', c: 'unpublished' });
        (0, vitest_1.expect)(findPublishedWithNodeType).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('scopes discovery to every tenant project so a cross-project target reads live', async () => {
        // Target workflow is owned by p2, but the trigger row stored projectId p1 (allowedProjectIds[0]).
        const { service, findPublishedWithNodeType } = setup([
            { workflowId: 'wf1', workflowName: 'A', projectId: 'p2', nodes: [wilNode('n1')] },
        ]);
        const result = await service.statuses([{ id: 'a', targetWorkflowId: 'wf1', targetNodeId: 'n1' }], ['p1', 'p2']);
        (0, vitest_1.expect)(Object.fromEntries(result)).toEqual({ a: 'live' });
        (0, vitest_1.expect)(findPublishedWithNodeType).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ projectIds: ['p1', 'p2'] }));
    });
    (0, vitest_1.it)('skips the query when no trigger has a target', async () => {
        const { service, findPublishedWithNodeType } = setup([]);
        await service.statuses([{ id: 'a', targetWorkflowId: null, targetNodeId: null }], ['p1']);
        (0, vitest_1.expect)(findPublishedWithNodeType).not.toHaveBeenCalled();
    });
});
