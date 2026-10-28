import { describe, expect, it } from 'vitest';
import { extractLastNodeOutput } from '../../../src/api/services/n8n-workflow-runner.service';

const run = (items: unknown[] | undefined, lastNodeExecuted: string | undefined = 'Last') =>
  ({
    data: { resultData: { lastNodeExecuted, runData: { Last: [{ data: { main: [items] } }] } } },
  }) as any;

describe('extractLastNodeOutput', () => {
  it('returns the json of a single item', () => {
    expect(extractLastNodeOutput(run([{ json: { a: 1 } }]))).toEqual({ a: 1 });
  });

  it('returns an array for several items', () => {
    expect(extractLastNodeOutput(run([{ json: { a: 1 } }, { json: { a: 2 } }]))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('returns undefined without output or last node', () => {
    expect(extractLastNodeOutput(run([]))).toBeUndefined();
    expect(extractLastNodeOutput(run([{ json: {} }], ''))).toBeUndefined();
    expect(extractLastNodeOutput({} as any)).toBeUndefined();
  });
});
