import { NodeOperationError } from 'n8n-workflow';
import { GRAPH_CREDENTIAL_TYPE, type GraphContext, type RetryOptions } from '../../transport/graphRequest';

export interface EnsureUserResult {
  lookupId: number;
  displayName: string;
  email: string;
  userName: string;
}

/**
 * Provision a user principal on a SharePoint site via the REST API
 * `POST /_api/web/ensureuser`. This requires the app registration to have
 * `Sites.Selected` granted on BOTH the Microsoft Graph resource AND the
 * "Office 365 SharePoint Online" resource. If only Graph is granted, this
 * returns 403 — handled with a specific error message (spec section 7.4).
 *
 * This is the fallback path when `resolvePersonLookupId` cannot find the
 * user in the User Information List (they've never visited the site).
 */
export async function ensureUser(
  context: GraphContext,
  retry: RetryOptions,
  siteHostname: string,
  sitePath: string,
  email: string,
): Promise<EnsureUserResult> {
  const baseSharePointUrl = `https://${siteHostname}${sitePath}`;

  let response: { d?: { Id?: number; Title?: string; Email?: string; LoginName?: string } };
  try {
    response = (await context.helpers.httpRequestWithAuthentication(GRAPH_CREDENTIAL_TYPE, {
      method: 'POST',
      url: `${baseSharePointUrl}/_api/web/ensureuser`,
      headers: {
        Accept: 'application/json;odata=verbose',
        'Content-Type': 'application/json;odata=verbose',
      },
      body: { logonName: email },
      json: true,
    })) as typeof response;
  } catch (error) {
    const statusCode =
      (error as { statusCode?: number }).statusCode ??
      (error as { response?: { statusCode?: number } }).response?.statusCode;
    if (statusCode === 403) {
      throw new NodeOperationError(
        context.getNode(),
        `Ensure User failed with 403 Forbidden. The app registration requires the "Sites.Selected" ` +
          `permission on the "Office 365 SharePoint Online" resource (not just Microsoft Graph). ` +
          `Ask an M365 admin to grant this additional permission for the app on this site.`,
      );
    }
    throw error;
  }

  const userData = response.d;
  if (!userData?.Id) {
    throw new NodeOperationError(
      context.getNode(),
      `Ensure User returned an unexpected response for "${email}" — no user ID in the response.`,
    );
  }

  return {
    lookupId: userData.Id,
    displayName: userData.Title ?? '',
    email: userData.Email ?? email,
    userName: userData.LoginName ?? '',
  };
}
