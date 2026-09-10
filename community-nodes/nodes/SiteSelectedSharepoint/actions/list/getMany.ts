import type { IDataObject } from 'n8n-workflow';
import { graphPagedRequest, type GraphContext, type RetryOptions } from '../../transport/graphRequest';
import type { ColumnMap } from '../../transport/resolve';

export interface GetManyListsOptions {
  includeHiddenLists: boolean;
  returnAll: boolean;
  limit?: number;
}

/**
 * Get many lists on a site (spec section 7.3). When getColumnMapForList is
 * supplied (the node's "Include Columns" option), fetches and attaches a
 * flattened column map per returned list — opt-in since it costs one extra
 * Graph call per distinct list on a cold cache.
 */
export async function getManyLists(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  options: GetManyListsOptions,
  getColumnMapForList?: (listId: string) => Promise<ColumnMap>,
): Promise<IDataObject[]> {
  const lists = await graphPagedRequest<IDataObject>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/lists`,
      qs: { includeHiddenLists: options.includeHiddenLists ? 'true' : undefined },
      json: true,
    },
    retry,
    { returnAll: options.returnAll, limit: options.limit },
  );

  if (!getColumnMapForList) return lists;

  const withColumns: IDataObject[] = [];
  for (const list of lists) {
    const columnMap = await getColumnMapForList(String(list.id));
    const flattened: IDataObject = {};
    for (const entry of columnMap.byInternalName.values()) {
      flattened[entry.displayName] = entry.internalName;
    }
    withColumns.push({ ...list, columnMap: flattened });
  }
  return withColumns;
}
