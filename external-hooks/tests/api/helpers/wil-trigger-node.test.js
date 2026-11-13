"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const wil_trigger_node_1 = require("../../../src/api/helpers/wil-trigger-node");
const NODE_TYPE = 'community-nodes.wilTrigger';
const node = (overrides = {}) => ({
    id: 'node-1',
    name: 'WIL Trigger',
    type: NODE_TYPE,
    parameters: {},
    ...overrides,
});
(0, vitest_1.describe)('parseWilTriggerNode / extractWilTriggerNodes', () => {
    (0, vitest_1.it)('applies node defaults when n8n omitted default-valued parameters', () => {
        const [info] = (0, wil_trigger_node_1.extractWilTriggerNodes)([node()]);
        (0, vitest_1.expect)(info).toMatchObject({
            nodeId: 'node-1',
            label: 'WIL Trigger',
            acceptedSources: ['chefs-form', 'button'],
            inputSource: 'passthrough',
            inputSchema: [],
            respondMode: 'immediately',
            responseTimeoutSec: 30,
        });
    });
    (0, vitest_1.it)('accepts both the CUSTOM and community-nodes type prefixes', () => {
        (0, vitest_1.expect)((0, wil_trigger_node_1.extractWilTriggerNodes)([node({ type: 'CUSTOM.wilTrigger' }), node({ id: 'n2' })]).map((n) => n.nodeId)).toEqual(['node-1', 'n2']);
    });
    (0, vitest_1.it)('ignores disabled nodes, other node types and nodes without an id', () => {
        (0, vitest_1.expect)((0, wil_trigger_node_1.extractWilTriggerNodes)([
            node({ disabled: true }),
            node({ type: 'n8n-nodes-base.webhook' }),
            node({ id: undefined }),
        ])).toEqual([]);
    });
    (0, vitest_1.it)('reads the declared workflow inputs and clamps the timeout', () => {
        const [info] = (0, wil_trigger_node_1.extractWilTriggerNodes)([
            node({
                parameters: {
                    displayLabel: 'Approve',
                    inputSource: 'workflowInputs',
                    workflowInputs: { values: [{ name: 'amount', type: 'number' }, { name: ' ' }] },
                    responseTimeoutSec: 9999,
                    respondMode: 'lastNode',
                },
            }),
        ]);
        (0, vitest_1.expect)(info).toMatchObject({
            label: 'Approve',
            inputSchema: [{ name: 'amount', type: 'number' }],
            responseTimeoutSec: 120,
            respondMode: 'lastNode',
        });
    });
    (0, vitest_1.it)('finds a node by its stable id, not its name', () => {
        (0, vitest_1.expect)((0, wil_trigger_node_1.findWilTriggerNode)([node({ name: 'Renamed' })], 'node-1')?.nodeName).toBe('Renamed');
        (0, vitest_1.expect)((0, wil_trigger_node_1.findWilTriggerNode)([node()], 'other')).toBeNull();
    });
});
(0, vitest_1.describe)('validateWilInput', () => {
    const schema = [
        { name: 'amount', type: 'number' },
        { name: 'note', type: 'string' },
    ];
    (0, vitest_1.it)('accepts matching, missing and empty values', () => {
        (0, vitest_1.expect)((0, wil_trigger_node_1.validateWilInput)(schema, { amount: 5, note: '' })).toEqual([]);
        (0, vitest_1.expect)((0, wil_trigger_node_1.validateWilInput)(schema, undefined)).toEqual([]);
    });
    (0, vitest_1.it)('reports wrong types', () => {
        (0, vitest_1.expect)((0, wil_trigger_node_1.validateWilInput)(schema, { amount: '5' })).toEqual(['"amount" must be of type number']);
    });
    (0, vitest_1.it)('skips validation for passthrough nodes', () => {
        (0, vitest_1.expect)((0, wil_trigger_node_1.validateWilInput)([], { anything: 1 })).toEqual([]);
    });
});
