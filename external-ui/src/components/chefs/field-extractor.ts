/**
 * Client-side field extraction for skip-CHEFS showform actions.
 *
 * When a `showform` action is configured with "Selected Fields Only", the WIL node
 * stores an array of { outputKey, sourcePath } mappings on the action payload. This
 * module applies those mappings to the submitted form data in the browser, so only
 * the chosen fields ever leave the user's device toward the callback URL.
 *
 * NOTE: The resolveFieldPath / extractFields logic here mirrors the pure functions in
 * community-nodes/nodes/CHEFSSubmissionExtractor/shared/fieldExtractor.ts. The two live
 * in separate packages (this one cannot import from community-nodes), so keep them in
 * sync if the path-resolution rules change.
 */

export interface CallbackFieldMapping {
  /** The key name in the callback payload sent to the workflow. */
  outputKey: string;
  /** Dot-notation path into the submitted form data, e.g. "address.city" or "items.0.name". */
  sourcePath: string;
}

export type MissingPathBehavior = 'returnNull' | 'omit';

interface FieldResolution {
  exists: boolean;
  value: unknown;
}

/**
 * Resolves a dot-separated path against a nested object. Supports array index access
 * via numeric segments (e.g. "items.0.name"). Never throws, never mutates the input.
 */
function resolveFieldPath(data: Record<string, unknown>, dotPath: string): FieldResolution {
  if (!dotPath || dotPath.trim() === '') {
    return { exists: false, value: undefined };
  }

  const segments = dotPath.split('.');
  let current: unknown = data;

  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { exists: false, value: undefined };
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { exists: false, value: undefined };
      }
      current = current[index];
    } else if (Object.prototype.hasOwnProperty.call(current as Record<string, unknown>, segment)) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return { exists: false, value: undefined };
    }
  }

  return { exists: true, value: current };
}

/**
 * Extracts the mapped fields from the submitted form data.
 *
 * @param data - The submitted form data object (from the formio:hostSubmit event detail).
 * @param mappings - Output-key → source-path mappings from the action payload.
 * @param missingPathBehavior - "returnNull" includes missing keys as null; "omit" leaves them out.
 * @returns A new object containing only the selected fields.
 */
export function extractCallbackFields(
  data: Record<string, unknown>,
  mappings: CallbackFieldMapping[],
  missingPathBehavior: MissingPathBehavior = 'returnNull',
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const mapping of mappings) {
    const resolution = resolveFieldPath(data, mapping.sourcePath);
    if (resolution.exists) {
      result[mapping.outputKey] = resolution.value;
    } else if (missingPathBehavior === 'returnNull') {
      result[mapping.outputKey] = null;
    }
    // 'omit' → leave the key out entirely
  }

  return result;
}
