import type { IDataObject } from 'n8n-workflow';
import { graphRequest, type GraphContext, type RetryOptions } from '../../transport/graphRequest';
import type { ColumnMap } from '../../transport/resolve';

/**
 * Get a list's metadata (spec section 7.3). When a column map is supplied
 * (the node's "Include Columns" option), attaches a flattened
 * display-name -> internal-name map to the output — this alone replaces
 * two nodes' worth of manual column debugging.
 */
export async function getList(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  listId: string,
  columnMap?: ColumnMap,
): Promise<IDataObject> {
  const list = await graphRequest<IDataObject>(
    context,
    { method: 'GET', url: `${baseUrl}/sites/${siteId}/lists/${listId}`, json: true },
    retry,
  );

  if (!columnMap) return list;

  const flattened: IDataObject = {};
  for (const entry of columnMap.byInternalName.values()) {
    flattened[entry.displayName] = entry.internalName;
  }
  return { ...list, columnMap: flattened };
}
