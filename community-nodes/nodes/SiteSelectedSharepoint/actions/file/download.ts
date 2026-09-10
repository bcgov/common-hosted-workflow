import type { IDataObject } from 'n8n-workflow';
import {
  graphRequest,
  graphBinaryRequest,
  type GraphContext,
  type BinaryRequestContext,
  type RetryOptions,
} from '../../transport/graphRequest';

export interface DownloadFileResult {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

/**
 * Download a file's content and metadata (spec section 7.1). Metadata and
 * content are two separate Graph calls — the content endpoint returns raw
 * bytes, not JSON, so it goes through graphBinaryRequest.
 */
export async function downloadFile(
  context: GraphContext & BinaryRequestContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  driveId: string,
  itemId: string,
): Promise<DownloadFileResult> {
  const metadata = await graphRequest<IDataObject>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/drives/${driveId}/items/${itemId}`,
      qs: { $select: 'name,file' },
      json: true,
    },
    retry,
  );

  const response = await graphBinaryRequest(
    context,
    { method: 'GET', url: `${baseUrl}/sites/${siteId}/drives/${driveId}/items/${itemId}/content` },
    retry,
  );

  const file = metadata.file as IDataObject | undefined;
  return {
    buffer: response.body,
    fileName: typeof metadata.name === 'string' && metadata.name ? metadata.name : 'download',
    mimeType: typeof file?.mimeType === 'string' && file.mimeType ? file.mimeType : 'application/octet-stream',
  };
}
