import { describe, expect, it, vi } from 'vitest';
import { downloadFile } from '../../nodes/BcGovSharePoint/actions/file/download';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>, requestOAuth2: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication, requestOAuth2 },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('downloadFile', () => {
  it('fetches metadata then binary content, returning buffer/fileName/mimeType', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({
      name: 'report.pdf',
      file: { mimeType: 'application/pdf' },
    });
    const requestOAuth2 = vi.fn().mockResolvedValue({ body: Buffer.from('%PDF-1.4'), headers: {} });
    const context = makeContext(httpRequestWithAuthentication, requestOAuth2);

    const result = await downloadFile(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'drive-1',
      'item-1',
    );

    expect(result).toEqual({ buffer: Buffer.from('%PDF-1.4'), fileName: 'report.pdf', mimeType: 'application/pdf' });
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/drives/drive-1/items/item-1',
      qs: { $select: 'name,file' },
    });
    expect(requestOAuth2.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/drives/drive-1/items/item-1/content',
    });
  });

  it('falls back to a default fileName/mimeType when metadata omits them', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({});
    const requestOAuth2 = vi.fn().mockResolvedValue({ body: Buffer.from('data'), headers: {} });
    const context = makeContext(httpRequestWithAuthentication, requestOAuth2);

    const result = await downloadFile(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'drive-1',
      'item-1',
    );

    expect(result.fileName).toBe('download');
    expect(result.mimeType).toBe('application/octet-stream');
  });
});
