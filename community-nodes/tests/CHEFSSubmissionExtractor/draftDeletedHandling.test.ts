import { describe, expect, it } from 'vitest';
import {
  CHEFSSubmissionExtractor,
  configuredOutputs,
} from '../../nodes/CHEFSSubmissionExtractor/CHEFSSubmissionExtractor.node';
import { CITY_MAPPING, createExecutionContext, executeWith, makeChefsSubmissionResponse } from './helpers';

const SUBMITTED = makeChefsSubmissionResponse();
const DRAFT = makeChefsSubmissionResponse({ draft: true });
const DELETED = makeChefsSubmissionResponse({ deleted: true });
const DELETED_DRAFT = makeChefsSubmissionResponse({ draft: true, deleted: true });

const MODES = [
  { mode: 'keyValue' as const, extra: { fieldMappings: CITY_MAPPING } },
  { mode: 'json' as const, extra: { fieldMappingJson: '{ "city": "company.headquarters.address.city" }' } },
  { mode: 'fullSubmission' as const, extra: {} },
];

/** Index of the output an item lands on with "route": 0 Submission, 1 Draft, 2 Deleted. */
const ROUTED = [
  { label: 'submitted', response: SUBMITTED, output: 0 },
  { label: 'draft', response: DRAFT, output: 1 },
  { label: 'deleted', response: DELETED, output: 2 },
  { label: 'deleted draft', response: DELETED_DRAFT, output: 2 },
];

describe('CHEFSSubmissionExtractor On Draft / Deleted Submission option', () => {
  describe('outputs', () => {
    it('builds the outputs expression from configuredOutputs', () => {
      expect(new CHEFSSubmissionExtractor().description.outputs).toBe(`={{(${configuredOutputs})($parameter)}}`);
    });

    it('has a single output when the value is missing (default: process)', () => {
      expect(configuredOutputs({})).toEqual([{ type: 'main' }]);
    });

    it.each(['process', 'stop'])('has a single output for "%s"', (draftDeletedHandling) => {
      expect(configuredOutputs({ draftDeletedHandling })).toEqual([{ type: 'main' }]);
    });

    it('adds Draft and Deleted outputs for "route"', () => {
      expect(configuredOutputs({ draftDeletedHandling: 'route' })).toEqual([
        { type: 'main', displayName: 'Submission' },
        { type: 'main', displayName: 'Draft' },
        { type: 'main', displayName: 'Deleted' },
      ]);
    });
  });

  describe.each(MODES)('$mode mode', ({ mode, extra }) => {
    it.each([
      ['draft', DRAFT],
      ['deleted', DELETED],
    ])('outputs a %s submission normally by default', async (_label, response) => {
      const { result } = await executeWith({ fieldMappingMode: mode, ...extra, httpResponse: response });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);
    });

    it.each([
      ['draft', DRAFT],
      ['deleted', DELETED],
    ])('outputs nothing for a %s submission with "stop"', async (_label, response) => {
      const { result } = await executeWith({
        fieldMappingMode: mode,
        ...extra,
        draftDeletedHandling: 'stop',
        httpResponse: response,
      });

      expect(result).toEqual([[]]);
    });

    it('still outputs a submitted submission with "stop"', async () => {
      const { result } = await executeWith({ fieldMappingMode: mode, ...extra, draftDeletedHandling: 'stop' });

      expect(result[0]).toHaveLength(1);
    });

    it.each(ROUTED)('sends a $label submission to output $output with "route"', async ({ response, output }) => {
      const { result } = await executeWith({
        fieldMappingMode: mode,
        ...extra,
        draftDeletedHandling: 'route',
        httpResponse: response,
      });

      expect(result).toHaveLength(3);
      result.forEach((items, index) => expect(items).toHaveLength(index === output ? 1 : 0));
    });
  });

  it('extracts the mapped fields for an item on the Draft output', async () => {
    const { result } = await executeWith({
      fieldMappings: CITY_MAPPING,
      draftDeletedHandling: 'route',
      httpResponse: DRAFT,
    });

    expect(result[1][0].json).toEqual({ city: 'Victoria' });
    expect(result[1][0].pairedItem).toEqual({ item: 0 });
  });

  it('includes the deleted flag in full submission output on the Deleted output', async () => {
    const { result } = await executeWith({
      fieldMappingMode: 'fullSubmission',
      draftDeletedHandling: 'route',
      httpResponse: DELETED,
    });

    expect((result[2][0].json as Record<string, unknown>).deleted).toBe(true);
  });

  it('splits several items across the three outputs with "route"', async () => {
    const ctx = createExecutionContext({ fieldMappings: CITY_MAPPING, draftDeletedHandling: 'route' });
    ctx.getInputData.mockReturnValue([{ json: {} }, { json: {} }, { json: {} }, { json: {} }]);
    ctx.helpers.httpRequest
      .mockResolvedValueOnce(SUBMITTED)
      .mockResolvedValueOnce(DRAFT)
      .mockResolvedValueOnce(DELETED)
      .mockResolvedValueOnce(SUBMITTED);

    const result = await new CHEFSSubmissionExtractor().execute.call(ctx as never);

    expect(result.map((items) => items.map((item) => item.pairedItem))).toEqual([
      [{ item: 0 }, { item: 3 }],
      [{ item: 1 }],
      [{ item: 2 }],
    ]);
  });

  it('drops only draft and deleted items with "stop"', async () => {
    const ctx = createExecutionContext({ fieldMappings: CITY_MAPPING, draftDeletedHandling: 'stop' });
    ctx.getInputData.mockReturnValue([{ json: {} }, { json: {} }, { json: {} }]);
    ctx.helpers.httpRequest
      .mockResolvedValueOnce(DRAFT)
      .mockResolvedValueOnce(SUBMITTED)
      .mockResolvedValueOnce(DELETED);

    const result = await new CHEFSSubmissionExtractor().execute.call(ctx as never);

    expect(result).toHaveLength(1);
    expect(result[0].map((item) => item.pairedItem)).toEqual([{ item: 1 }]);
  });

  it('puts continue-on-fail error items on the Submission output with "route"', async () => {
    const { result } = await executeWith({
      submissionId: '  ',
      continueOnFail: true,
      draftDeletedHandling: 'route',
    });

    expect(result[0][0].json).toEqual({ error: 'Submission ID is required and cannot be empty' });
    expect(result[1]).toEqual([]);
    expect(result[2]).toEqual([]);
  });
});
