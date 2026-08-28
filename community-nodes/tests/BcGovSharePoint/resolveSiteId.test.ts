import { describe, expect, it, vi } from 'vitest';
import { resolveSiteId } from '../../nodes/BcGovSharePoint/transport/resolve';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('resolveSiteId', () => {
  it('parses a full site URL and calls GET /sites/{hostname}:{path}', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: 'bcgov.sharepoint.com,coll-1,web-1' });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await resolveSiteId(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      {
        mode: 'url',
        value: 'https://bcgov.sharepoint.com/sites/ENV-STB-TEST',
      },
    );

    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      url: 'https://graph.microsoft.com/v1.0/sites/bcgov.sharepoint.com:/sites/ENV-STB-TEST',
    });
    expect(result).toEqual({
      siteId: 'bcgov.sharepoint.com,coll-1,web-1',
      hostname: 'bcgov.sharepoint.com',
      siteCollectionId: 'coll-1',
      webId: 'web-1',
    });
  });

  it('resolves from explicit hostname + path', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: 'bcgov.sharepoint.com,coll-1,web-1' });
    const context = makeContext(httpRequestWithAuthentication);

    await resolveSiteId(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      {
        mode: 'hostPath',
        hostname: 'bcgov.sharepoint.com',
        path: '/sites/ENV-STB-TEST',
      },
    );

    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      url: 'https://graph.microsoft.com/v1.0/sites/bcgov.sharepoint.com:/sites/ENV-STB-TEST',
    });
  });

  it('passes an ID straight through without a Graph call', async () => {
    const httpRequestWithAuthentication = vi.fn();
    const context = makeContext(httpRequestWithAuthentication);

    const result = await resolveSiteId(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      {
        mode: 'id',
        value: 'bcgov.sharepoint.com,coll-1,web-1',
      },
    );

    expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
    expect(result).toEqual({
      siteId: 'bcgov.sharepoint.com,coll-1,web-1',
      hostname: 'bcgov.sharepoint.com',
      siteCollectionId: 'coll-1',
      webId: 'web-1',
    });
  });
});
