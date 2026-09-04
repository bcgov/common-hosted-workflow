import type { IDataObject } from 'n8n-workflow';
import { graphRequest, type GraphContext, type RetryOptions } from '../../transport/graphRequest';
import { coerceFieldsForWrite } from '../../transport/coerce';
import type { ColumnMap } from '../../transport/resolve';

/**
 * Create a SharePoint list item (spec section 7.2). Coerces rawFields
 * through the list's column map before writing.
 */
export async function createItem(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  listId: string,
  columnMap: ColumnMap,
  rawFields: IDataObject,
): Promise<IDataObject> {
  const fields = await coerceFieldsForWrite(context, baseUrl, retry, siteId, columnMap, rawFields);
  const url = `${baseUrl}/sites/${siteId}/lists/${listId}/items`;
  return graphRequest<IDataObject>(
    context,
    {
      method: 'POST',
      url,
      body: { fields },
      json: true,
    },
    retry,
  );
}
