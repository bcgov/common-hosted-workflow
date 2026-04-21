import { describe, expect, it } from 'vitest';
import {
  resolveFieldPath,
  validateFieldPaths,
  extractFields,
} from '../../nodes/CHEFSSubmissionExtractor/shared/fieldExtractor';
import { makeFieldExtractorTestData } from './helpers';

// ── resolveFieldPath ──

describe('resolveFieldPath', () => {
  const data = makeFieldExtractorTestData();

  // ── Basic object traversal ──

  it('resolves a top-level key', () => {
    expect(resolveFieldPath(data, 'status')).toEqual({ exists: true, value: 'submitted' });
  });

  it('resolves a deeply nested path', () => {
    expect(resolveFieldPath(data, 'company.headquarters.address.city')).toEqual({
      exists: true,
      value: 'Victoria',
    });
  });

  it('resolves a path whose value is null', () => {
    expect(resolveFieldPath(data, 'applicant.phone')).toEqual({ exists: true, value: null });
  });

  it('resolves a path whose value is an empty string', () => {
    expect(resolveFieldPath(data, 'emptyField')).toEqual({ exists: true, value: '' });
  });

  it('resolves a path whose value is 0', () => {
    expect(resolveFieldPath(data, 'zeroField')).toEqual({ exists: true, value: 0 });
  });

  it('resolves a path whose value is false', () => {
    expect(resolveFieldPath(data, 'falseField')).toEqual({ exists: true, value: false });
  });

  it('resolves a path to an entire nested object', () => {
    const result = resolveFieldPath(data, 'company.headquarters.address');
    expect(result.exists).toBe(true);
    expect(result.value).toEqual({ city: 'Victoria', province: 'BC' });
  });

  // ── Non-existent paths ──

  it('returns exists: false for a missing top-level key', () => {
    expect(resolveFieldPath(data, 'nonexistent')).toEqual({ exists: false, value: undefined });
  });

  it('returns exists: false for a missing nested key', () => {
    expect(resolveFieldPath(data, 'applicant.fax')).toEqual({ exists: false, value: undefined });
  });

  it('returns exists: false when traversing through a primitive', () => {
    expect(resolveFieldPath(data, 'status.nested.key')).toEqual({ exists: false, value: undefined });
  });

  it('returns exists: false when traversing through null', () => {
    expect(resolveFieldPath(data, 'applicant.phone.extension')).toEqual({ exists: false, value: undefined });
  });

  // ── Array index support ──

  it('resolves an array element by numeric index', () => {
    expect(resolveFieldPath(data, 'items.0')).toEqual({
      exists: true,
      value: { name: 'Widget', quantity: 5 },
    });
  });

  it('resolves a nested property inside an array element', () => {
    expect(resolveFieldPath(data, 'items.0.name')).toEqual({ exists: true, value: 'Widget' });
    expect(resolveFieldPath(data, 'items.1.quantity')).toEqual({ exists: true, value: 3 });
  });

  it('resolves nested arrays (matrix access)', () => {
    expect(resolveFieldPath(data, 'nested.matrix.0.1')).toEqual({ exists: true, value: 20 });
    expect(resolveFieldPath(data, 'nested.matrix.1.0')).toEqual({ exists: true, value: 30 });
  });

  it('returns exists: false for an out-of-bounds array index', () => {
    expect(resolveFieldPath(data, 'items.5')).toEqual({ exists: false, value: undefined });
  });

  it('returns exists: false for a negative array index', () => {
    expect(resolveFieldPath(data, 'items.-1')).toEqual({ exists: false, value: undefined });
  });

  it('returns exists: false for a non-integer segment on an array', () => {
    expect(resolveFieldPath(data, 'items.abc')).toEqual({ exists: false, value: undefined });
  });

  it('returns exists: false for a float segment on an array', () => {
    expect(resolveFieldPath(data, 'items.1.5')).toEqual({ exists: false, value: undefined });
  });

  // ── Empty / invalid path edge cases ──

  it('returns exists: false for an empty string path', () => {
    expect(resolveFieldPath(data, '')).toEqual({ exists: false, value: undefined });
  });

  it('returns exists: false for a whitespace-only path', () => {
    expect(resolveFieldPath(data, '   ')).toEqual({ exists: false, value: undefined });
  });
});

// ── validateFieldPaths ──

describe('validateFieldPaths', () => {
  const data = makeFieldExtractorTestData();

  it('returns valid: true when all paths exist', () => {
    const result = validateFieldPaths(data, [
      { outputKey: 'name', sourcePath: 'applicant.name' },
      { outputKey: 'city', sourcePath: 'company.headquarters.address.city' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.missingPaths).toEqual([]);
  });

  it('collects all missing paths', () => {
    const result = validateFieldPaths(data, [
      { outputKey: 'name', sourcePath: 'applicant.name' },
      { outputKey: 'foo', sourcePath: 'nonexistent.path' },
      { outputKey: 'bar', sourcePath: 'also.missing' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.missingPaths).toEqual([
      { outputKey: 'foo', sourcePath: 'nonexistent.path' },
      { outputKey: 'bar', sourcePath: 'also.missing' },
    ]);
  });

  it('returns valid: true for an empty mappings array', () => {
    const result = validateFieldPaths(data, []);
    expect(result.valid).toBe(true);
    expect(result.missingPaths).toEqual([]);
  });
});

// ── extractFields ──

describe('extractFields', () => {
  const data = makeFieldExtractorTestData();

  it('extracts existing fields into the output object', () => {
    const result = extractFields(data, [
      { outputKey: 'name', sourcePath: 'applicant.name' },
      { outputKey: 'city', sourcePath: 'company.headquarters.address.city' },
    ]);
    expect(result).toEqual({ name: 'Jane Doe', city: 'Victoria' });
  });

  it('returns null for non-existent paths', () => {
    const result = extractFields(data, [
      { outputKey: 'name', sourcePath: 'applicant.name' },
      { outputKey: 'foo', sourcePath: 'nonexistent.path' },
    ]);
    expect(result).toEqual({ name: 'Jane Doe', foo: null });
  });

  it('preserves null values from existing paths', () => {
    const result = extractFields(data, [{ outputKey: 'phone', sourcePath: 'applicant.phone' }]);
    expect(result).toEqual({ phone: null });
  });

  it('extracts fields from array elements', () => {
    const result = extractFields(data, [{ outputKey: 'firstItem', sourcePath: 'items.0.name' }]);
    expect(result).toEqual({ firstItem: 'Widget' });
  });

  it('produces exactly one key per mapping', () => {
    const mappings = [
      { outputKey: 'a', sourcePath: 'applicant.name' },
      { outputKey: 'b', sourcePath: 'missing' },
      { outputKey: 'c', sourcePath: 'company.headquarters.address.city' },
    ];
    const result = extractFields(data, mappings);
    expect(Object.keys(result)).toHaveLength(3);
    expect(result).toEqual({ a: 'Jane Doe', b: null, c: 'Victoria' });
  });
});
