import { describe, expect, it, vi } from 'vitest';
import { createCachedResolvers } from '../../nodes/BcGovSharePoint/transport/resolve';
import { TtlCache } from '../../nodes/BcGovSharePoint/transport/cache';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('createCachedResolvers', () => {
  it('caches resolveSiteId within TTL — second call does not hit the network', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: 'bcgov.sharepoint.com,coll-1,web-1' });
    const context = makeContext(httpRequestWithAuthentication);
    const cache = new TtlCache<unknown>(60_000);
    const resolvers = createCachedResolvers(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      cache,
      'cred-1',
    );

    const input = { mode: 'url' as const, value: 'https://bcgov.sharepoint.com/sites/ENV-STB-TEST' };
    const first = await resolvers.resolveSiteId(input);
    const second = await resolvers.resolveSiteId(input);

    expect(first).toEqual(second);
    expect(httpRequestWithAuthentication).toHaveBeenCalledOnce();
  });

  it('does not share cache entries across different credential IDs', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: 'bcgov.sharepoint.com,coll-1,web-1' });
    const context = makeContext(httpRequestWithAuthentication);
    const cache = new TtlCache<unknown>(60_000);
    const input = { mode: 'url' as const, value: 'https://bcgov.sharepoint.com/sites/ENV-STB-TEST' };

    const resolversA = createCachedResolvers(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      cache,
      'cred-1',
    );
    const resolversB = createCachedResolvers(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      cache,
      'cred-2',
    );

    await resolversA.resolveSiteId(input);
    await resolversB.resolveSiteId(input);

    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
  });

  it('caches resolveListId, resolveDriveId, and getColumnMap independently by scope', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: 'list-1', displayName: 'MyList' }] }) // resolveListId filter
      .mockResolvedValueOnce({ id: 'drive-default' }) // resolveDriveId default
      .mockResolvedValueOnce({ value: [{ name: 'Field1', displayName: 'Field 1', text: {} }] }); // getColumnMap
    const context = makeContext(httpRequestWithAuthentication);
    const cache = new TtlCache<unknown>(60_000);
    const resolvers = createCachedResolvers(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      cache,
      'cred-1',
    );

    await resolvers.resolveListId('site-1', { mode: 'name', value: 'MyList' });
    await resolvers.resolveListId('site-1', { mode: 'name', value: 'MyList' });
    await resolvers.resolveDriveId('site-1', { mode: 'default' });
    await resolvers.resolveDriveId('site-1', { mode: 'default' });
    await resolvers.getColumnMap('site-1', 'list-1');
    await resolvers.getColumnMap('site-1', 'list-1');

    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(3);
  });
});
