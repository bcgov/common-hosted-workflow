import { describe, expect, it, vi } from 'vitest';
import { uploadFile } from '../../nodes/BcGovSharePoint/actions/file/upload';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>, requestOAuth2: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication, requestOAuth2 },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

const SMALL_OPTIONS = { conflictBehavior: 'replace' as const, chunkSizeBytes: 320 * 1024, createParentFolders: true };

describe('uploadFile — small file (<=4MB)', () => {
  it('PUTs directly to the content endpoint with conflictBehavior in the URL', async () => {
    const httpRequestWithAuthentication = vi.fn();
    const requestOAuth2 = vi
      .fn()
      .mockResolvedValue({ body: Buffer.from(JSON.stringify({ id: 'item-1' })), headers: {} });
    const context = makeContext(httpRequestWithAuthentication, requestOAuth2);
    const buffer = Buffer.from('small file content');

    const result = await uploadFile(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'drive-1',
      'Reports',
      'file.pdf',
      buffer,
      SMALL_OPTIONS,
    );

    expect(result).toEqual({ id: 'item-1' });
    expect(requestOAuth2.mock.calls[0][1]).toMatchObject({
      method: 'PUT',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/drives/drive-1/root:/Reports/file.pdf:/content?@microsoft.graph.conflictBehavior=replace',
      body: buffer,
    });
    expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
  });

  it('percent-encodes special characters in folder/file names and preserves the conflictBehavior query string', async () => {
    const httpRequestWithAuthentication = vi.fn();
    const requestOAuth2 = vi
      .fn()
      .mockResolvedValue({ body: Buffer.from(JSON.stringify({ id: 'item-hash' })), headers: {} });
    const context = makeContext(httpRequestWithAuthentication, requestOAuth2);
    const buffer = Buffer.from('content');

    const result = await uploadFile(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'drive-1',
      'Report #1',
      'file #1.pdf',
      buffer,
      SMALL_OPTIONS,
    );

    expect(result).toEqual({ id: 'item-hash' });
    const calledUrl = requestOAuth2.mock.calls[0][1].url as string;
    expect(calledUrl).toBe(
      'https://graph.microsoft.com/v1.0/sites/site-1/drives/drive-1/root:/Report%20%231/file%20%231.pdf:/content?@microsoft.graph.conflictBehavior=replace',
    );
    expect(calledUrl).not.toContain('Report #1');
    expect(calledUrl).toContain('%23');
    expect(calledUrl).toContain('?@microsoft.graph.conflictBehavior=replace');
  });

  it('rejects a chunk size that is not a multiple of 320 KiB', async () => {
    const context = makeContext(vi.fn(), vi.fn());
    await expect(
      uploadFile(
        context,
        'https://graph.microsoft.com/v1.0',
        { maxRetries: 1 },
        'site-1',
        'drive-1',
        '',
        'file.pdf',
        Buffer.from('x'),
        {
          ...SMALL_OPTIONS,
          chunkSizeBytes: 1000,
        },
      ),
    ).rejects.toThrow(/320 KiB/);
  });
});

describe('uploadFile — large file (>4MB, chunked)', () => {
  it('creates an upload session then PUTs a chunk with the correct Content-Range', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ uploadUrl: 'https://upload.example/session-1' });
    const requestOAuth2 = vi
      .fn()
      .mockResolvedValueOnce({ body: Buffer.from(JSON.stringify({ id: 'item-2' })), headers: {} });
    const context = makeContext(httpRequestWithAuthentication, requestOAuth2);

    const totalSize = 4 * 1024 * 1024 + 1; // 1 byte over the 4 MiB small-file threshold
    const chunkSize = 327680 * 13; // aligned to 320 KiB, large enough to cover totalSize in one chunk
    const buffer = Buffer.alloc(totalSize, 'a');

    const result = await uploadFile(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'drive-1',
      '',
      'big.bin',
      buffer,
      { conflictBehavior: 'fail', chunkSizeBytes: chunkSize, createParentFolders: true },
    );

    expect(result).toEqual({ id: 'item-2' });
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/drives/drive-1/root:/big.bin:/createUploadSession',
      body: { item: { '@microsoft.graph.conflictBehavior': 'fail' } },
    });
    expect(requestOAuth2).toHaveBeenCalledOnce();
    expect(requestOAuth2.mock.calls[0][1]).toMatchObject({
      method: 'PUT',
      url: 'https://upload.example/session-1',
      headers: { 'Content-Length': String(totalSize), 'Content-Range': `bytes 0-${totalSize - 1}/${totalSize}` },
    });
  });

  it('splits a file into multiple sequential chunks with correct offsets', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ uploadUrl: 'https://upload.example/session-2' });
    const requestOAuth2 = vi
      .fn()
      .mockResolvedValueOnce({ body: Buffer.from(''), headers: {} })
      .mockResolvedValueOnce({ body: Buffer.from(''), headers: {} })
      .mockResolvedValueOnce({ body: Buffer.from(JSON.stringify({ id: 'item-3' })), headers: {} });
    const context = makeContext(httpRequestWithAuthentication, requestOAuth2);

    const chunkSize = 327680 * 7; // 2.1875 MiB, aligned to the 320 KiB minimum unit
    const totalSize = chunkSize * 2 + 100; // 3 chunks: full, full, partial — total exceeds the 4 MiB small-file threshold
    const buffer = Buffer.alloc(totalSize, 'b');

    const result = await uploadFile(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'drive-1',
      '',
      'multi.bin',
      buffer,
      { conflictBehavior: 'replace', chunkSizeBytes: chunkSize, createParentFolders: true },
    );

    expect(result).toEqual({ id: 'item-3' });
    expect(requestOAuth2).toHaveBeenCalledTimes(3);
    expect(requestOAuth2.mock.calls[0][1]).toMatchObject({
      headers: { 'Content-Length': String(chunkSize), 'Content-Range': `bytes 0-${chunkSize - 1}/${totalSize}` },
    });
    expect(requestOAuth2.mock.calls[1][1]).toMatchObject({
      headers: {
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${chunkSize}-${chunkSize * 2 - 1}/${totalSize}`,
      },
    });
    expect(requestOAuth2.mock.calls[2][1]).toMatchObject({
      headers: {
        'Content-Length': '100',
        'Content-Range': `bytes ${chunkSize * 2}-${totalSize - 1}/${totalSize}`,
      },
    });
  });
});
