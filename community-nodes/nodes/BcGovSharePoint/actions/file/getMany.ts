import type { IDataObject } from 'n8n-workflow';
import {
  graphPagedRequest,
  type GraphContext,
  type RetryOptions,
  type PagingOptions,
} from '../../transport/graphRequest';

export interface GetManyFilesOptions extends PagingOptions {
  folderPath: string;
  nameFilter?: string;
}

/**
 * List/search files in a document library folder with optional name filtering.
 * Supports searching by file name using OData $filter on the name field.
 *
 * Graph endpoint:
 *   GET /sites/{siteId}/drives/{driveId}/root/children         (root)
 *   GET /sites/{siteId}/drives/{driveId}/root:/{path}:/children (subfolder)
 *
 * When nameFilter is provided, applies: $filter=contains(name, '{nameFilter}')
 * Note: Graph's $filter support on drive children is limited — not all operators
 * work. `contains` on `name` is the most reliably supported pattern.
 * Falls back to client-side filtering if the API returns a FilterNotSupported error.
 */
export async function getManyFiles(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  driveId: string,
  options: GetManyFilesOptions,
): Promise<IDataObject[]> {
  const folderPath = options.folderPath.replace(/^\/+|\/+$/g, '');
  const pathSegment = folderPath
    ? `/root:/${encodeURIComponent(folderPath).replace(/%2F/g, '/')}:/children`
    : '/root/children';

  const qs: IDataObject = {
    $select: 'id,name,size,webUrl,createdDateTime,lastModifiedDateTime,file,folder',
  };

  // Graph's $filter on drive items has limited support — use search approach
  // for name filtering via client-side post-filter for reliability.
  const useClientFilter = Boolean(options.nameFilter);

  // If filtering by name, fetch all items then filter client-side.
  // This is more reliable than $filter which is inconsistent on drive children.
  const pagingOptions: PagingOptions = useClientFilter
    ? { returnAll: true }
    : { returnAll: options.returnAll, limit: options.limit };

  const items = await graphPagedRequest<IDataObject>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/drives/${driveId}${pathSegment}`,
      qs,
      json: true,
    },
    retry,
    pagingOptions,
  );

  let result = items;

  if (options.nameFilter) {
    const needle = options.nameFilter.toLowerCase();
    result = items.filter((item) => {
      const name = typeof item.name === 'string' ? item.name.toLowerCase() : '';
      return name.includes(needle);
    });
  }

  // Apply limit after client-side filtering
  if (!options.returnAll && options.limit !== undefined && result.length > options.limit) {
    result = result.slice(0, options.limit);
  }

  return result;
}
