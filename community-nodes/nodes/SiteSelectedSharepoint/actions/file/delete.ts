import type { IDataObject } from 'n8n-workflow';
import { graphRequest, type GraphContext, type RetryOptions } from '../../transport/graphRequest';

/**
 * Delete a file by its drive-item ID.
 *
 * Graph endpoint: DELETE /sites/{siteId}/drives/{driveId}/items/{itemId}
 * Returns 204 No Content on success.
 */
export async function deleteFile(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  driveId: string,
  itemId: string,
): Promise<IDataObject> {
  await graphRequest<void>(
    context,
    {
      method: 'DELETE',
      url: `${baseUrl}/sites/${siteId}/drives/${driveId}/items/${itemId}`,
      json: true,
    },
    retry,
  );
  return { deleted: true, id: itemId };
}
