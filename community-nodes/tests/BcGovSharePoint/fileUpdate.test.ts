import { describe, expect, it, vi } from 'vitest';
import { updateFile } from '../../nodes/BcGovSharePoint/actions/file/update';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>, requestOAuth2: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication, requestOAuth2 },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('updateFile', () => {
  it('mode "updateMetadata" PATCHes item metadata and does not touch content', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: 'item-1', name: 'renamed.pdf' });
    const requestOAuth2 = vi.fn();
    const context = makeContext(httpRequestWithAuthentication, requestOAuth2);

    const result = await updateFile(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'drive-1',
      'item-1',
      {
        mode: 'updateMetadata',
        metadata: { name: 'renamed.pdf' },
      },
    );

    expect(result).toEqual({ id: 'item-1', name: 'renamed.pdf' });
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/drives/drive-1/items/item-1',
      body: { name: 'renamed.pdf' },
    });
    expect(requestOAuth2).not.toHaveBeenCalled();
  });

  it('mode "replaceContents" PUTs new content and does not touch metadata', async () => {
    const httpRequestWithAuthentication = vi.fn();
    const requestOAuth2 = vi
      .fn()
      .mockResolvedValue({ body: Buffer.from(JSON.stringify({ id: 'item-1' })), headers: {} });
    const context = makeContext(httpRequestWithAuthentication, requestOAuth2);
    const newContent = Buffer.from('new bytes');

    const result = await updateFile(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'drive-1',
      'item-1',
      {
        mode: 'replaceContents',
        newContent,
      },
    );

    expect(result).toEqual({ id: 'item-1' });
    expect(requestOAuth2.mock.calls[0][1]).toMatchObject({
      method: 'PUT',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/drives/drive-1/items/item-1/content',
      body: newContent,
    });
    expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
  });

  it('throws when mode requires content but none is supplied', async () => {
    const context = makeContext(vi.fn(), vi.fn());
    await expect(
      updateFile(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', 'drive-1', 'item-1', {
        mode: 'replaceContents',
      }),
    ).rejects.toThrow(/binary/i);
  });
});
