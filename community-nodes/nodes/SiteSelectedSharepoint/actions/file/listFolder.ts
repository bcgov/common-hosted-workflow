import type { IDataObject } from 'n8n-workflow';
import {
  graphPagedRequest,
  type GraphContext,
  type RetryOptions,
  type PagingOptions,
} from '../../transport/graphRequest';

export interface ListFolderOptions extends PagingOptions {
  folderPath: string;
}

export interface DriveItemSummary {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  webUrl?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  mimeType?: string;
}

/**
 * List files and subfolders within a given folder path in the document library.
 * If folderPath is empty/root, lists the root of the drive.
 *
 * Graph endpoint:
 *   GET /sites/{siteId}/drives/{driveId}/root/children         (root)
 *   GET /sites/{siteId}/drives/{driveId}/root:/{path}:/children (subfolder)
 */
export async function listFolder(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  driveId: string,
  options: ListFolderOptions,
): Promise<IDataObject[]> {
  const folderPath = options.folderPath.replace(/^\/+|\/+$/g, '');
  const pathSegment = folderPath
    ? `/root:/${encodeURIComponent(folderPath).replace(/%2F/g, '/')}:/children`
    : '/root/children';

  const items = await graphPagedRequest<IDataObject>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/drives/${driveId}${pathSegment}`,
      qs: { $select: 'id,name,size,webUrl,createdDateTime,lastModifiedDateTime,file,folder' },
      json: true,
    },
    retry,
    { returnAll: options.returnAll, limit: options.limit },
  );

  return items.map((item) => {
    const file = item.file as IDataObject | undefined;
    const folder = item.folder as IDataObject | undefined;
    const result: IDataObject = {
      id: item.id,
      name: item.name,
      type: folder ? 'folder' : 'file',
      size: item.size,
      webUrl: item.webUrl,
      createdDateTime: item.createdDateTime,
      lastModifiedDateTime: item.lastModifiedDateTime,
    };
    if (file) {
      result.mimeType = (file as IDataObject).mimeType;
    }
    if (folder) {
      result.childCount = (folder as IDataObject).childCount;
    }
    return result;
  });
}
