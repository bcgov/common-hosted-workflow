import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { graphPagedRequest, type GraphContext, type RetryOptions } from '../../transport/graphRequest';
import { compileSimpleFilter, type SimpleFilterCondition } from './getMany';
import { createItem } from './create';
import { updateItem } from './update';
import type { ColumnMap } from '../../transport/resolve';

export interface ItemLocation {
  siteId: string;
  listId: string;
}

/**
 * Create-or-update a SharePoint list item (spec section 7.2). Match fields
 * are AND-composed into a filter; a match PATCHes, no match POSTs a new
 * item seeded with the match fields plus rawFields.
 */
export async function createOrUpdateItem(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  location: ItemLocation,
  columnMap: ColumnMap,
  rawFields: IDataObject,
  matchFields: IDataObject,
): Promise<IDataObject> {
  const matchEntries = Object.entries(matchFields);
  if (matchEntries.length === 0) {
    throw new NodeOperationError(context.getNode(), 'Create or Update requires at least one match field.');
  }

  const conditions: SimpleFilterCondition[] = matchEntries.map(([column, value]) => ({
    column,
    operator: 'eq',
    value: String(value),
  }));
  const filter = compileSimpleFilter(columnMap, conditions);

  const existing = await graphPagedRequest<{ id: string }>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${location.siteId}/lists/${location.listId}/items`,
      qs: { $expand: 'fields', $filter: filter },
      headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
      json: true,
    },
    retry,
    { returnAll: false, limit: 1 },
  );

  const match = existing[0];
  if (match) {
    return updateItem(
      context,
      baseUrl,
      retry,
      { siteId: location.siteId, listId: location.listId, itemId: match.id },
      columnMap,
      rawFields,
    );
  }
  return createItem(context, baseUrl, retry, location.siteId, location.listId, columnMap, {
    ...matchFields,
    ...rawFields,
  });
}
