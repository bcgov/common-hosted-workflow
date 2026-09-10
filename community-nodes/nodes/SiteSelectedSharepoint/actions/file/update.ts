import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
  graphRequest,
  graphBinaryRequest,
  type GraphContext,
  type BinaryRequestContext,
  type RetryOptions,
} from '../../transport/graphRequest';

export interface UpdateFileOptions {
  mode: 'replaceContents' | 'updateMetadata' | 'both';
  metadata?: IDataObject;
  newContent?: Buffer;
}

/**
 * Update a file's metadata and/or contents (spec section 7.1). Metadata
 * update is a JSON PATCH; content replacement is a binary PUT — done in
 * that order when both are requested, matching the order an author would
 * naturally expect (rename, then replace).
 */
export async function updateFile(
  context: GraphContext & BinaryRequestContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  driveId: string,
  itemId: string,
  options: UpdateFileOptions,
): Promise<IDataObject> {
  let metadataResult: IDataObject = {};

  if (options.mode === 'updateMetadata' || options.mode === 'both') {
    metadataResult = await graphRequest<IDataObject>(
      context,
      {
        method: 'PATCH',
        url: `${baseUrl}/sites/${siteId}/drives/${driveId}/items/${itemId}`,
        body: options.metadata ?? {},
        json: true,
      },
      retry,
    );
  }

  if (options.mode === 'replaceContents' || options.mode === 'both') {
    if (!options.newContent) {
      throw new NodeOperationError(context.getNode(), 'Replace Contents requires binary input data.');
    }
    const response = await graphBinaryRequest(
      context,
      {
        method: 'PUT',
        url: `${baseUrl}/sites/${siteId}/drives/${driveId}/items/${itemId}/content`,
        body: options.newContent,
      },
      retry,
    );
    return response.body.length ? (JSON.parse(response.body.toString('utf8')) as IDataObject) : metadataResult;
  }

  return metadataResult;
}
