import { describe, expect, it } from 'vitest';
import {
  extractWilTriggerNodes,
  findWilTriggerNode,
  validateWilInput,
} from '../../../src/api/helpers/wil-trigger-node';

const NODE_TYPE = 'community-nodes.wilTrigger';
const node = (overrides: Record<string, unknown> = {}) => ({
  id: 'node-1',
  name: 'WIL Trigger',
  type: NODE_TYPE,
  parameters: {},
  ...overrides,
});

describe('parseWilTriggerNode / extractWilTriggerNodes', () => {
  it('applies node defaults when n8n omitted default-valued parameters', () => {
    const [info] = extractWilTriggerNodes([node()]);
    expect(info).toMatchObject({
      nodeId: 'node-1',
      label: 'WIL Trigger',
      acceptedSources: ['chefs-form', 'button'],
      inputSource: 'passthrough',
      inputSchema: [],
      respondMode: 'immediately',
      responseTimeoutSec: 30,
    });
  });

  it('accepts both the CUSTOM and community-nodes type prefixes', () => {
    expect(
      extractWilTriggerNodes([node({ type: 'CUSTOM.wilTrigger' }), node({ id: 'n2' })]).map((n) => n.nodeId),
    ).toEqual(['node-1', 'n2']);
  });

  it('ignores disabled nodes, other node types and nodes without an id', () => {
    expect(
      extractWilTriggerNodes([
        node({ disabled: true }),
        node({ type: 'n8n-nodes-base.webhook' }),
        node({ id: undefined }),
      ]),
    ).toEqual([]);
  });

  it('reads the declared workflow inputs and clamps the timeout', () => {
    const [info] = extractWilTriggerNodes([
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
    expect(info).toMatchObject({
      label: 'Approve',
      inputSchema: [{ name: 'amount', type: 'number' }],
      responseTimeoutSec: 120,
      respondMode: 'lastNode',
    });
  });

  it('derives the schema from a JSON example and tolerates invalid JSON', () => {
    const [ok] = extractWilTriggerNodes([
      node({ parameters: { inputSource: 'jsonExample', jsonExample: '{"a":1,"b":[1],"c":true}' } }),
    ]);
    expect(ok.inputSchema).toEqual([
      { name: 'a', type: 'number' },
      { name: 'b', type: 'array' },
      { name: 'c', type: 'boolean' },
    ]);
    const [bad] = extractWilTriggerNodes([node({ parameters: { inputSource: 'jsonExample', jsonExample: '{' } })]);
    expect(bad.inputSchema).toEqual([]);
  });

  it('finds a node by its stable id, not its name', () => {
    expect(findWilTriggerNode([node({ name: 'Renamed' })], 'node-1')?.nodeName).toBe('Renamed');
    expect(findWilTriggerNode([node()], 'other')).toBeNull();
  });
});

describe('validateWilInput', () => {
  const schema = [
    { name: 'amount', type: 'number' as const },
    { name: 'note', type: 'string' as const },
  ];

  it('accepts matching, missing and empty values', () => {
    expect(validateWilInput(schema, { amount: 5, note: '' })).toEqual([]);
    expect(validateWilInput(schema, undefined)).toEqual([]);
  });

  it('reports wrong types', () => {
    expect(validateWilInput(schema, { amount: '5' })).toEqual(['"amount" must be of type number']);
  });

  it('skips validation for passthrough nodes', () => {
    expect(validateWilInput([], { anything: 1 })).toEqual([]);
  });
});
