import { describe, expect, it } from 'vitest';
import { executeWith, CITY_MAPPING } from './helpers';

// Reusable mapping fragments for tests that need more than the single-city default
const CITY_AND_NAME_MAPPING = {
  mapping: [
    { outputKey: 'city', sourcePath: 'company.headquarters.address.city' },
    { outputKey: 'name', sourcePath: 'applicant.name' },
  ],
};

// ── Basic field extraction ──

describe('CHEFSSubmissionExtractor execute', () => {
  describe('key-value mode', () => {
    it('extracts fields using UI key-value mappings', async () => {
      const { result } = await executeWith({ fieldMappings: CITY_AND_NAME_MAPPING });

      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toEqual({ city: 'Victoria', name: 'Jane Doe' });
    });

    it('extracts deeply nested fields', async () => {
      const { result } = await executeWith({
        fieldMappings: {
          mapping: [{ outputKey: 'sfId', sourcePath: 'company.meta.integrations.salesforce.accountId' }],
        },
      });

      expect(result[0][0].json).toEqual({ sfId: 'SF-12345' });
    });
  });

  describe('JSON mode', () => {
    it('extracts fields using JSON mapping', async () => {
      const { result } = await executeWith({
        fieldMappingMode: 'json',
        fieldMappingJson: '{ "city": "company.headquarters.address.city", "email": "applicant.email" }',
      });

      expect(result[0][0].json).toEqual({ city: 'Victoria', email: 'jane@example.com' });
    });
  });

  // ── Missing path behavior ──

  describe('missing path behavior', () => {
    it('returns null for missing paths in returnNull mode', async () => {
      const { result } = await executeWith({
        missingPathBehavior: 'returnNull',
        fieldMappings: {
          mapping: [
            { outputKey: 'city', sourcePath: 'company.headquarters.address.city' },
            { outputKey: 'foo', sourcePath: 'nonexistent.path' },
          ],
        },
      });

      expect(result[0][0].json).toEqual({ city: 'Victoria', foo: null });
    });

    it('throws when missing paths exist in throwError mode', async () => {
      await expect(
        executeWith({
          missingPathBehavior: 'throwError',
          fieldMappings: {
            mapping: [{ outputKey: 'foo', sourcePath: 'nonexistent.path' }],
          },
        }),
      ).rejects.toThrow('The following fields do not exist on the submission');
    });

    it('includes all missing paths in the error message', async () => {
      await expect(
        executeWith({
          missingPathBehavior: 'throwError',
          fieldMappings: {
            mapping: [
              { outputKey: 'a', sourcePath: 'missing.one' },
              { outputKey: 'b', sourcePath: 'missing.two' },
            ],
          },
        }),
      ).rejects.toThrow('"a" (path: missing.one)');
    });
  });

  // ── Submission metadata ──

  describe('submission metadata', () => {
    it('appends metadata when includeSubmissionMeta is true', async () => {
      const { result } = await executeWith({
        includeSubmissionMeta: true,
        fieldMappings: CITY_MAPPING,
      });

      const json = result[0][0].json as Record<string, unknown>;
      expect(json.city).toBe('Victoria');
      expect(json._createdBy).toBe('gateway-user');
      expect(json._createdAt).toBe('2026-04-16T21:57:00.610Z');
      expect(json._updatedBy).toBeNull();
      expect(json._updatedAt).toBe('2026-04-16T21:57:00.610Z');
    });

    it('does not include metadata when includeSubmissionMeta is false', async () => {
      const { result } = await executeWith({
        includeSubmissionMeta: false,
        fieldMappings: CITY_MAPPING,
      });

      const json = result[0][0].json as Record<string, unknown>;
      expect(json).not.toHaveProperty('_createdBy');
      expect(json).not.toHaveProperty('_createdAt');
    });
  });

  // ── API request ──

  describe('API request', () => {
    it('calls the CHEFS API with the correct submission ID', async () => {
      const { httpRequest } = await executeWith({
        submissionId: 'my-sub-id',
        fieldMappings: CITY_MAPPING,
      });

      expect(httpRequest).toHaveBeenCalledTimes(1);
      const callArgs = httpRequest.mock.calls[0][0];
      expect(callArgs.method).toBe('GET');
      expect(callArgs.url).toContain('/submissions/my-sub-id');
    });

    it('sends Basic Auth header with correct credentials', async () => {
      const { httpRequest } = await executeWith({
        formId: 'test-form',
        apiKey: 'test-key', // pragma: allowlist secret
        fieldMappings: CITY_MAPPING,
      });

      const callArgs = httpRequest.mock.calls[0][0];
      const expectedToken = Buffer.from('test-form:test-key').toString('base64');
      expect(callArgs.headers.Authorization).toBe(`Basic ${expectedToken}`);
    });
  });

  // ── Item linking ──

  describe('item linking', () => {
    it('includes pairedItem metadata on output', async () => {
      const { result } = await executeWith({ fieldMappings: CITY_MAPPING });

      expect(result[0][0]).toHaveProperty('pairedItem', { item: 0 });
    });
  });

  // ── Validation: field mapping JSON shape ──

  describe('JSON mapping validation', () => {
    it('rejects an array as JSON mapping', async () => {
      await expect(
        executeWith({
          fieldMappingMode: 'json',
          fieldMappingJson: '[1, 2, 3]',
        }),
      ).rejects.toThrow('Field mapping JSON must be a flat object');
    });

    it('rejects a string as JSON mapping', async () => {
      await expect(
        executeWith({
          fieldMappingMode: 'json',
          fieldMappingJson: '"hello"',
        }),
      ).rejects.toThrow('Field mapping JSON must be a flat object');
    });

    it('rejects null as JSON mapping', async () => {
      await expect(
        executeWith({
          fieldMappingMode: 'json',
          fieldMappingJson: 'null',
        }),
      ).rejects.toThrow('Field mapping JSON must be a flat object');
    });

    it('rejects non-string values in JSON mapping', async () => {
      await expect(
        executeWith({
          fieldMappingMode: 'json',
          fieldMappingJson: '{ "count": 123 }',
        }),
      ).rejects.toThrow('Field mapping value for "count" must be a string, got number');
    });

    it('rejects invalid JSON syntax', async () => {
      await expect(
        executeWith({
          fieldMappingMode: 'json',
          fieldMappingJson: '{ bad json }',
        }),
      ).rejects.toThrow('Invalid field mapping JSON');
    });

    it('rejects an empty JSON object (no mappings)', async () => {
      await expect(
        executeWith({
          fieldMappingMode: 'json',
          fieldMappingJson: '{}',
        }),
      ).rejects.toThrow('At least one field mapping is required');
    });
  });

  // ── Validation: empty mappings ──

  describe('empty mappings', () => {
    it('throws when key-value mappings are empty', async () => {
      await expect(
        executeWith({
          fieldMappingMode: 'keyValue',
          fieldMappings: { mapping: [] },
        }),
      ).rejects.toThrow('At least one field mapping is required');
    });
  });

  // ── Validation: credentials ──

  describe('credential validation', () => {
    it('throws when formId is empty', async () => {
      await expect(executeWith({ formId: '', fieldMappings: CITY_MAPPING })).rejects.toThrow(
        'CHEFS credentials are incomplete',
      );
    });

    it('throws when apiKey is empty', async () => {
      await expect(executeWith({ apiKey: '', fieldMappings: CITY_MAPPING })).rejects.toThrow(
        'CHEFS credentials are incomplete',
      );
    });
  });

  // ── Validation: submission ID ──

  describe('submission ID validation', () => {
    it('throws when submission ID is empty', async () => {
      await expect(executeWith({ submissionId: '', fieldMappings: CITY_MAPPING })).rejects.toThrow(
        'Submission ID is required and cannot be empty',
      );
    });

    it('throws when submission ID is whitespace only', async () => {
      await expect(executeWith({ submissionId: '   ', fieldMappings: CITY_MAPPING })).rejects.toThrow(
        'Submission ID is required and cannot be empty',
      );
    });
  });

  // ── API response structure validation ──

  describe('API response validation', () => {
    it('throws when response is missing submission wrapper', async () => {
      await expect(executeWith({ httpResponse: {}, fieldMappings: CITY_MAPPING })).rejects.toThrow(
        'missing submission wrapper',
      );
    });

    it('throws when response is missing submission data', async () => {
      await expect(
        executeWith({ httpResponse: { submission: { submission: null } }, fieldMappings: CITY_MAPPING }),
      ).rejects.toThrow('missing submission data');
    });
  });

  // ── continueOnFail ──

  describe('continueOnFail', () => {
    it('returns error object instead of throwing when continueOnFail is enabled', async () => {
      const { result } = await executeWith({
        continueOnFail: true,
        submissionId: '',
        fieldMappings: CITY_MAPPING,
      });

      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toHaveProperty('error');
      expect((result[0][0].json as Record<string, unknown>).error).toContain('Submission ID is required');
    });

    it('preserves pairedItem on error output', async () => {
      const { result } = await executeWith({
        continueOnFail: true,
        submissionId: '',
        fieldMappings: CITY_MAPPING,
      });

      expect(result[0][0]).toHaveProperty('pairedItem', { item: 0 });
    });
  });

  // ── Edge cases: falsy and empty values ──

  describe('falsy and empty values', () => {
    it('preserves null values from the submission', async () => {
      const { result } = await executeWith({
        fieldMappings: {
          mapping: [{ outputKey: 'phone', sourcePath: 'applicant.phone' }],
        },
      });

      expect(result[0][0].json).toEqual({ phone: null });
    });

    it('preserves empty string values', async () => {
      const { result } = await executeWith({
        fieldMappings: {
          mapping: [{ outputKey: 'empty', sourcePath: 'emptyField' }],
        },
      });

      expect(result[0][0].json).toEqual({ empty: '' });
    });

    it('preserves numeric zero values', async () => {
      const { result } = await executeWith({
        fieldMappings: {
          mapping: [{ outputKey: 'num', sourcePath: 'count' }],
        },
      });

      expect(result[0][0].json).toEqual({ num: 42 });
    });

    it('preserves boolean false values', async () => {
      const { result } = await executeWith({
        fieldMappings: {
          mapping: [{ outputKey: 'flag', sourcePath: 'active' }],
        },
      });

      expect(result[0][0].json).toEqual({ flag: true });
    });
  });
});
