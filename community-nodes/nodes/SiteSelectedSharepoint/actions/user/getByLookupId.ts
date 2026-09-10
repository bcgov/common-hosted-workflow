import { NodeOperationError, type IDataObject } from 'n8n-workflow';
import { resolvePersonByLookupId } from '../../transport/resolve';
import type { GraphContext, RetryOptions } from '../../transport/graphRequest';

export type OnLookupNotFoundBehavior = 'error' | 'continue';

/**
 * Parse the raw LookupId input (a single value or comma-separated list) into
 * a deduplicated list of positive integers, preserving first-seen order.
 * Non-numeric or non-positive tokens are rejected so a typo surfaces early
 * rather than producing a silent 404 downstream.
 */
export function parseLookupIds(context: GraphContext, raw: string): number[] {
  const tokens = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const seen = new Set<number>();
  const ids: number[] = [];
  for (const token of tokens) {
    const parsed = Number(token);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new NodeOperationError(
        context.getNode(),
        `"${token}" is not a valid SharePoint LookupId — expected a positive integer.`,
      );
    }
    if (!seen.has(parsed)) {
      seen.add(parsed);
      ids.push(parsed);
    }
  }

  return ids;
}

/**
 * Resolve one or more person LookupIds to their display name/email via the
 * User Information List (spec section 7.4). This is the reverse of
 * getLookupId: it turns the "{Internal}LookupId" integers a Get/Get Many
 * item returns (e.g. RequestingOfficerLookupId) back into a person.
 *
 * IDs are deduplicated so the same principal is never fetched twice, and each
 * unique id is one Graph call. `onNotFound: 'continue'` yields a result with
 * null-ish fields for a missing principal instead of throwing, letting the
 * caller decide per-row behaviour.
 */
export async function getUserByLookupId(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  rawLookupIds: string,
  onNotFound: OnLookupNotFoundBehavior,
): Promise<IDataObject[]> {
  const ids = parseLookupIds(context, rawLookupIds);
  if (ids.length === 0) {
    throw new NodeOperationError(context.getNode(), 'No LookupId was provided.');
  }

  const results: IDataObject[] = [];
  for (const lookupId of ids) {
    const resolved = await resolvePersonByLookupId(context, baseUrl, retry, siteId, lookupId);

    if (resolved === null) {
      if (onNotFound === 'error') {
        throw new NodeOperationError(
          context.getNode(),
          `No SharePoint principal found for LookupId ${lookupId} on this site.`,
        );
      }
      // `requestedLookupId` echoes the input so callers can join results back
      // to their source rows even when the principal is missing.
      results.push({ requestedLookupId: lookupId, lookupId, email: '', displayName: '', userName: '' });
      continue;
    }

    results.push({ requestedLookupId: lookupId, ...resolved });
  }

  return results;
}
