import type { IDataObject } from 'n8n-workflow';
import { graphRequest, type GraphContext, type RetryOptions } from '../../transport/graphRequest';

/** Get a single SharePoint list item with fields expanded (spec section 7.2). */
export async function getItem(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  listId: string,
  itemId: string,
): Promise<IDataObject> {
  return graphRequest<IDataObject>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/lists/${listId}/items/${itemId}`,
      qs: { $expand: 'fields' },
      json: true,
    },
    retry,
  );
}
