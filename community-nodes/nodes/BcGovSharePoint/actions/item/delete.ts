import { graphRequest, type GraphContext, type RetryOptions } from '../../transport/graphRequest';

/** Delete a SharePoint list item (spec section 7.2). */
export async function deleteItem(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  listId: string,
  itemId: string,
): Promise<{ deleted: true }> {
  await graphRequest<unknown>(
    context,
    { method: 'DELETE', url: `${baseUrl}/sites/${siteId}/lists/${listId}/items/${itemId}`, json: true },
    retry,
  );
  return { deleted: true };
}
