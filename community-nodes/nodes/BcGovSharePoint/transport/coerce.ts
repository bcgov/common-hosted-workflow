import type { IDataObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { resolvePersonLookupId, resolveLookupItemId, type ColumnMap, type ColumnMapEntry } from './resolve';
import type { GraphContext, RetryOptions } from './graphRequest';

/**
 * Find a column by display name (case-insensitive) first, then internal
 * name — spec section 6.2 rule 4: "accept either key."
 */
export function findColumnEntry(columnMap: ColumnMap, key: string): ColumnMapEntry | undefined {
  return columnMap.byDisplayName.get(key.toLowerCase()) ?? columnMap.byInternalName.get(key);
}

function isLuxonLike(value: unknown): value is { toISO: () => string | null } {
  return typeof value === 'object' && value !== null && typeof (value as { toISO?: unknown }).toISO === 'function';
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coerce a dateTime column's raw value to ISO 8601 UTC (spec section 6.3).
 * Accepts a Luxon-shaped DateTime (duck-typed — no luxon import, NFR1), a
 * native JS Date, epoch milliseconds, a bare yyyy-MM-dd date, or an ISO string.
 */
export function coerceDateTime(fieldLabel: string, value: unknown): string {
  if (isLuxonLike(value)) {
    const iso = value.toISO();
    if (iso) return iso;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof value === 'string') {
    if (DATE_ONLY_PATTERN.test(value)) {
      return new Date(`${value}T00:00:00.000Z`).toISOString();
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  throw new Error(`Field "${fieldLabel}" must be a date/time — received: ${JSON.stringify(value)}`);
}

const TRUE_STRINGS = new Set(['yes', 'true', '1']);
const FALSE_STRINGS = new Set(['no', 'false', '0']);

/** Coerce a boolean column's raw value (spec section 6.3: true/false, Yes/No, 1/0). */
export function coerceBoolean(fieldLabel: string, value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUE_STRINGS.has(normalized)) return true;
    if (FALSE_STRINGS.has(normalized)) return false;
  }
  throw new Error(
    `Field "${fieldLabel}" must be a boolean (true/false, yes/no, 1/0) — received: ${JSON.stringify(value)}`,
  );
}

/** Coerce a number/currency column's raw value, rejecting NaN (spec section 6.3). */
export function coerceNumber(fieldLabel: string, value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    throw new TypeError(`Field "${fieldLabel}" must be a number — received: ${JSON.stringify(value)}`);
  }
  return num;
}

interface HyperlinkValue {
  Description: string;
  Url: string;
}

/** Coerce a hyperlinkOrPicture column's raw value (spec section 6.3). */
export function coerceHyperlink(fieldLabel: string, value: unknown): HyperlinkValue {
  if (typeof value === 'string' && value) {
    return { Description: value, Url: value };
  }
  if (value && typeof value === 'object') {
    const obj = value as IDataObject;
    const url = obj.url ?? obj.Url;
    if (typeof url === 'string' && url) {
      const description = obj.description ?? obj.Description;
      return { Description: typeof description === 'string' && description ? description : url, Url: url };
    }
  }
  throw new Error(
    `Field "${fieldLabel}" must be a URL string or { url, description } — received: ${JSON.stringify(value)}`,
  );
}

async function coerceSingleScalar(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  entry: ColumnMapEntry,
  value: unknown,
): Promise<unknown> {
  switch (entry.type) {
    case 'text':
    case 'note':
    case 'choice':
      return String(value);
    case 'number':
    case 'currency':
      return coerceNumber(entry.displayName, value);
    case 'boolean':
      return coerceBoolean(entry.displayName, value);
    case 'dateTime':
      return coerceDateTime(entry.displayName, value);
    case 'hyperlinkOrPicture':
      return coerceHyperlink(entry.displayName, value);
    case 'personOrGroup': {
      const result = await resolvePersonLookupId(context, baseUrl, retry, siteId, String(value));
      return result.lookupId;
    }
    case 'lookup': {
      if (!entry.lookup?.listId) {
        throw new Error(
          `Field "${entry.internalName}" is a lookup column with no target list configured on the list schema.`,
        );
      }
      return resolveLookupItemId(
        context,
        baseUrl,
        retry,
        siteId,
        entry.lookup.listId,
        entry.lookup.column ?? 'Title',
        String(value),
      );
    }
    default:
      throw new Error(`Field "${entry.displayName}" has an unsupported column type "${entry.type}" for writing.`);
  }
}

const LOOKUP_ID_TYPES = new Set<ColumnMapEntry['type']>(['personOrGroup', 'lookup']);

/**
 * Normalize a multi-value column's raw input into an array of scalar values.
 *
 * When the "Value" field is used in Expression mode, n8n evaluates an array
 * expression (e.g. ["Angling","Hunting"]) and flattens it to a comma-joined
 * string ("Angling,Hunting") before the node's execute code runs. A real
 * array (JSON mode, or a value already re-hydrated by normalizeFieldValue)
 * arrives intact. This recovers both shapes:
 *   - a real array passes through unchanged
 *   - a comma-joined string is split back into trimmed, non-empty values
 *   - any other scalar becomes a single-element array
 *
 * Comma-splitting is only applied here, in the allowMultiple branch, so
 * single-value columns whose legitimate value contains a comma are never
 * affected.
 */
function toMultiValueArray(rawValue: unknown): unknown[] {
  if (Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue === 'string' && rawValue.includes(',')) {
    return rawValue
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  return [rawValue];
}

/**
 * Coerce one raw field value into its Graph write payload fragment (spec
 * section 6.3). Person/Lookup columns write to an "{Internal}LookupId" key;
 * multi-value columns add the matching "@odata.type" sibling key.
 */
export async function coerceFieldValue(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  entry: ColumnMapEntry,
  rawValue: unknown,
): Promise<IDataObject> {
  const targetKey = LOOKUP_ID_TYPES.has(entry.type) ? `${entry.internalName}LookupId` : entry.internalName;

  if (entry.allowMultiple) {
    const values = toMultiValueArray(rawValue);
    const coerced = await Promise.all(
      values.map((value) => coerceSingleScalar(context, baseUrl, retry, siteId, entry, value)),
    );
    // Graph requires the Collection(...) @odata.type annotation on every
    // multi-value column write — Person/Lookup columns write integer LookupId
    // collections (Collection(Edm.Int32)); multi-choice string columns write
    // Collection(Edm.String). Omitting the annotation is what SharePoint
    // rejects with an opaque 500 "generalException" (confirmed against
    // Microsoft's documented multi-select write shape and the n8n community's
    // report that the built-in node's plain-array write also fails with a 400
    // for exactly this reason).
    const odataType = LOOKUP_ID_TYPES.has(entry.type) ? 'Collection(Edm.Int32)' : 'Collection(Edm.String)';
    return { [`${targetKey}@odata.type`]: odataType, [targetKey]: coerced };
  }

  const coerced = await coerceSingleScalar(context, baseUrl, retry, siteId, entry, rawValue);
  return { [targetKey]: coerced } as IDataObject;
}

/**
 * Coerce a raw display-name-or-internal-name-keyed fields object into a
 * Graph `fields` write payload, resolving Person/Lookup values along the
 * way. A key not present on the list's writable column map raises an
 * actionable error naming the known writable fields — the map only ever
 * contains writable columns (Plan 1's buildColumnMap already drops
 * read-only/system ones), so "not found" and "read-only" cannot be told
 * apart here; the message says both are possible rather than guessing.
 */
export async function coerceFieldsForWrite(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  columnMap: ColumnMap,
  rawFields: IDataObject,
): Promise<IDataObject> {
  const output: IDataObject = {};

  for (const [key, rawValue] of Object.entries(rawFields)) {
    if (rawValue === null || rawValue === undefined) continue;

    const entry = findColumnEntry(columnMap, key);
    if (!entry) {
      const available = [...columnMap.byInternalName.values()].map((e) => e.displayName).join(', ');
      throw new NodeOperationError(
        context.getNode(),
        `Field "${key}" is not writable — either it doesn't exist on this list or it's a read-only/system column. Known writable fields: ${available}.`,
      );
    }

    try {
      const fragment = await coerceFieldValue(context, baseUrl, retry, siteId, entry, rawValue);
      Object.assign(output, fragment);
    } catch (error) {
      if (error instanceof NodeOperationError || error instanceof NodeApiError) throw error;
      throw new NodeOperationError(context.getNode(), (error as Error).message);
    }
  }

  return output;
}
