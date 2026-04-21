import type { FieldMapping, FieldResolution, ValidationResult } from './types';

/**
 * Resolves a dot-separated path against a nested object.
 * Supports array index access via numeric segments (e.g. "items.0.name").
 * Never throws, never mutates the input data.
 *
 * @param data - The root object to traverse
 * @param dotPath - A dot-separated path string, e.g. "company.address.city" or "items.0.name"
 * @returns FieldResolution indicating whether the path exists and its value
 */
export function resolveFieldPath(data: Record<string, unknown>, dotPath: string): FieldResolution {
  if (!dotPath || dotPath.trim() === '') {
    return { exists: false, value: undefined };
  }

  const segments = dotPath.split('.');
  let current: unknown = data;

  for (let i = 0; i < segments.length; i++) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { exists: false, value: undefined };
    }

    const segment = segments[i];

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { exists: false, value: undefined };
      }
      current = current[index];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) {
        return { exists: false, value: undefined };
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return { exists: true, value: current };
}

/**
 * Validates that all field mapping source paths exist in the data.
 * Collects all missing paths into a single result.
 *
 * @param data - The submission data object
 * @param mappings - Array of field mappings to validate
 * @returns ValidationResult with valid flag and list of missing paths
 */
export function validateFieldPaths(data: Record<string, unknown>, mappings: FieldMapping[]): ValidationResult {
  const missingPaths: Array<{ outputKey: string; sourcePath: string }> = [];

  for (const mapping of mappings) {
    const resolution = resolveFieldPath(data, mapping.sourcePath);
    if (!resolution.exists) {
      missingPaths.push({
        outputKey: mapping.outputKey,
        sourcePath: mapping.sourcePath,
      });
    }
  }

  return {
    valid: missingPaths.length === 0,
    missingPaths,
  };
}

/**
 * Extracts fields from data according to the provided mappings.
 * Returns null for paths that do not exist.
 *
 * @param data - The submission data object
 * @param mappings - Array of field mappings defining output keys and source paths
 * @returns An object with exactly N keys (one per mapping), using null for non-existent paths
 */
export function extractFields(data: Record<string, unknown>, mappings: FieldMapping[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const mapping of mappings) {
    const resolution = resolveFieldPath(data, mapping.sourcePath);
    result[mapping.outputKey] = resolution.exists ? resolution.value : null;
  }

  return result;
}
