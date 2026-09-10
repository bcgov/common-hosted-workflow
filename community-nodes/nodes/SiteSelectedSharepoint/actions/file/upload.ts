import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
  graphRequest,
  graphBinaryRequest,
  type GraphContext,
  type BinaryRequestContext,
  type RetryOptions,
} from '../../transport/graphRequest';

export interface UploadFileOptions {
  conflictBehavior: 'fail' | 'replace' | 'rename';
  /** Must be a multiple of 320 KiB (327680 bytes) per Graph's chunked-upload requirement. */
  chunkSizeBytes: number;
  createParentFolders: boolean;
}

export interface UploadTarget {
  siteId: string;
  driveId: string;
  folderPath: string;
  fileName: string;
}

const SMALL_FILE_THRESHOLD_BYTES = 4 * 1024 * 1024;
const CHUNK_ALIGNMENT_BYTES = 320 * 1024;

function parseJsonBody(body: Buffer): IDataObject {
  return body.length ? (JSON.parse(body.toString('utf8')) as IDataObject) : {};
}

/**
 * Percent-encode each path segment (leaving `/` as a literal separator) so
 * that characters such as `#`, `?`, `&`, and `%` in a user-supplied folder
 * path or file name cannot truncate or corrupt the Graph request URL.
 */
function encodePathSegments(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function assertParentFolderExists(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  driveId: string,
  folderPath: string,
): Promise<void> {
  try {
    await graphRequest<IDataObject>(
      context,
      {
        method: 'GET',
        url: `${baseUrl}/sites/${siteId}/drives/${driveId}/root:/${encodePathSegments(folderPath)}`,
        json: true,
      },
      retry,
    );
  } catch {
    throw new NodeOperationError(
      context.getNode(),
      `Folder "${folderPath}" does not exist and Create Parent Folders is off. Enable Create Parent Folders or create the folder first.`,
    );
  }
}

async function uploadLargeFile(
  context: GraphContext & BinaryRequestContext,
  baseUrl: string,
  retry: RetryOptions,
  target: UploadTarget,
  itemPath: string,
  buffer: Buffer,
  options: UploadFileOptions,
): Promise<IDataObject> {
  const session = await graphRequest<{ uploadUrl: string }>(
    context,
    {
      method: 'POST',
      url: `${baseUrl}/sites/${target.siteId}/drives/${target.driveId}/root:/${itemPath}:/createUploadSession`,
      body: { item: { '@microsoft.graph.conflictBehavior': options.conflictBehavior } },
      json: true,
    },
    retry,
  );

  const totalSize = buffer.length;
  let offset = 0;
  let lastResponseBody: IDataObject = {};

  while (offset < totalSize) {
    const end = Math.min(offset + options.chunkSizeBytes, totalSize);
    const chunk = buffer.subarray(offset, end);
    const response = await graphBinaryRequest(
      context,
      {
        method: 'PUT',
        url: session.uploadUrl,
        body: chunk,
        headers: {
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
        },
      },
      retry,
    );
    lastResponseBody = parseJsonBody(response.body);
    offset = end;
  }

  return lastResponseBody;
}

/**
 * Upload a file (spec section 7.1). Files at or under 4 MiB go through a
 * single PUT to the content endpoint; larger files use Graph's chunked
 * upload session, with each chunk PUT independently retried (spec
 * section 10) rather than restarting the whole upload on a transient
 * failure.
 */
export async function uploadFile(
  context: GraphContext & BinaryRequestContext,
  baseUrl: string,
  retry: RetryOptions,
  target: UploadTarget,
  buffer: Buffer,
  options: UploadFileOptions,
): Promise<IDataObject> {
  if (options.chunkSizeBytes % CHUNK_ALIGNMENT_BYTES !== 0) {
    throw new NodeOperationError(
      context.getNode(),
      `Chunk Size must be a multiple of 320 KiB (327680 bytes) — received ${options.chunkSizeBytes} bytes.`,
    );
  }

  const normalizedFolder = target.folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const itemPath = normalizedFolder
    ? `${encodePathSegments(normalizedFolder)}/${encodeURIComponent(target.fileName)}`
    : encodeURIComponent(target.fileName);

  if (!options.createParentFolders && normalizedFolder) {
    await assertParentFolderExists(context, baseUrl, retry, target.siteId, target.driveId, normalizedFolder);
  }

  if (buffer.length <= SMALL_FILE_THRESHOLD_BYTES) {
    const response = await graphBinaryRequest(
      context,
      {
        method: 'PUT',
        url: `${baseUrl}/sites/${target.siteId}/drives/${target.driveId}/root:/${itemPath}:/content?@microsoft.graph.conflictBehavior=${options.conflictBehavior}`,
        body: buffer,
      },
      retry,
    );
    return parseJsonBody(response.body);
  }

  return uploadLargeFile(context, baseUrl, retry, target, itemPath, buffer, options);
}
