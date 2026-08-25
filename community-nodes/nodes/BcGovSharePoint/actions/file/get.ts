import type { IDataObject } from 'n8n-workflow';
import { graphRequest, type GraphContext, type RetryOptions } from '../../transport/graphRequest';

/**
 * Get a single file's metadata by its drive-item ID.
 *
 * Graph endpoint: GET /sites/{siteId}/drives/{driveId}/items/{itemId}
 */
export async function getFile(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  driveId: string,
  itemId: string,
): Promise<IDataObject> {
  return graphRequest<IDataObject>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/drives/${driveId}/items/${itemId}`,
      json: true,
    },
    retry,
  );
}
