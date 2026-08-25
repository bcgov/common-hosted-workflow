import { NodeOperationError } from 'n8n-workflow';
import { resolvePersonLookupId, type PersonLookupResult } from '../../transport/resolve';
import type { GraphContext, RetryOptions } from '../../transport/graphRequest';
import { ensureUser } from './ensureUser';

export type OnNotFoundBehavior = 'error' | 'continue' | 'ensureUser';

export interface EnsureUserSiteInfo {
  hostname: string;
  path: string;
}

/**
 * Resolve a person's SharePoint LookupId by email (spec section 7.4).
 * `onNotFound: 'continue'` returns null instead of throwing — the caller
 * decides per-item behaviour, matching the "On Not Found" node option.
 * `onNotFound: 'ensureUser'` falls back to SharePoint REST's ensureuser
 * endpoint to provision the principal on the site (requires dual
 * Sites.Selected permission).
 */
export async function getUserLookupId(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  email: string,
  onNotFound: OnNotFoundBehavior,
  siteInfo?: EnsureUserSiteInfo,
): Promise<PersonLookupResult | null> {
  try {
    return await resolvePersonLookupId(context, baseUrl, retry, siteId, email);
  } catch (error) {
    if (onNotFound === 'continue' && error instanceof NodeOperationError) {
      return null;
    }
    if (onNotFound === 'ensureUser' && error instanceof NodeOperationError) {
      if (!siteInfo) {
        throw new NodeOperationError(
          context.getNode(),
          `Ensure User requires a resolvable site URL — the site hostname and path could not be determined.`,
        );
      }
      const result = await ensureUser(context, retry, siteInfo.hostname, siteInfo.path, email);
      return {
        email,
        lookupId: result.lookupId,
        displayName: result.displayName,
        userName: result.userName,
      };
    }
    throw error;
  }
}
