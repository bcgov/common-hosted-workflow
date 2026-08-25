import type { IDataObject } from 'n8n-workflow';
import { graphRequest, type GraphContext, type RetryOptions } from '../../transport/graphRequest';
import { coerceFieldsForWrite } from '../../transport/coerce';
import type { ColumnMap } from '../../transport/resolve';

export interface UpdateItemTarget {
  siteId: string;
  listId: string;
  itemId: string;
}

export interface UpdateItemOptions {
  /** Optional ETag for optimistic concurrency (spec section 7.2). */
  ifMatchEtag?: string;
}

/**
 * Update a SharePoint list item's fields (spec section 7.2). PATCHes only
 * the coerced fields — Graph's fields endpoint is a partial update.
 */
export async function updateItem(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  target: UpdateItemTarget,
  columnMap: ColumnMap,
  rawFields: IDataObject,
  options: UpdateItemOptions = {},
): Promise<IDataObject> {
  const fields = await coerceFieldsForWrite(context, baseUrl, retry, target.siteId, columnMap, rawFields);
  return graphRequest<IDataObject>(
    context,
    {
      method: 'PATCH',
      url: `${baseUrl}/sites/${target.siteId}/lists/${target.listId}/items/${target.itemId}/fields`,
      body: fields,
      ...(options.ifMatchEtag ? { headers: { 'If-Match': options.ifMatchEtag } } : {}),
      json: true,
    },
    retry,
  );
}
