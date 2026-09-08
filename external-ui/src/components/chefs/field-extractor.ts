/**
 * Client-side field extraction for skip-CHEFS showform actions.
 *
 * When a `showform` action is configured with "Selected Fields Only", the WIL node
 * stores an array of { outputKey, sourcePath } mappings on the action payload. This
 * module applies those mappings to the submitted form data in the browser, so only
 * the chosen fields ever leave the user's device toward the callback URL.
 *
 * NOTE: The path-resolution rules here match the pure functions in
 * community-nodes/nodes/CHEFSSubmissionExtractor/shared/fieldExtractor.ts (dot-notation,
 * array-index access, no throwing, no mutation). The two live in separate packages (this
 * one cannot import from community-nodes) and are implemented independently, so keep their
 * behaviour in sync if the path-resolution rules change.
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

/** Sentinel returned when a single path segment cannot be resolved. */
const NOT_FOUND = Symbol('not-found');

/** Reads one segment from a container, returning NOT_FOUND when the segment is absent. */
function readSegment(container: unknown, segment: string): unknown {
  if (container === null || typeof container !== 'object') {
    return NOT_FOUND;
  }
  if (Array.isArray(container)) {
    const index = Number(segment);
    const isValidIndex = Number.isInteger(index) && index >= 0 && index < container.length;
    return isValidIndex ? container[index] : NOT_FOUND;
  }
  const record = container as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(record, segment) ? record[segment] : NOT_FOUND;
}

function resolveFieldPath(data: Record<string, unknown>, dotPath: string): FieldResolution {
  if (!dotPath.trim()) {
    return { exists: false, value: undefined };
  }

  const resolved = dotPath.split('.').reduce<unknown>((acc, segment) => {
    return acc === NOT_FOUND ? NOT_FOUND : readSegment(acc, segment);
  }, data as unknown);

  return resolved === NOT_FOUND ? { exists: false, value: undefined } : { exists: true, value: resolved };
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
