import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchLists, searchDrives } from '../../nodes/BcGovSharePoint/methods/loadOptions';
import { _resetCachesForTesting } from '../../nodes/BcGovSharePoint/transport/cache';

beforeEach(() => {
  _resetCachesForTesting();
});

function makeLoadOptionsFunctions(httpMock: ReturnType<typeof vi.fn>) {
  return {
    getCredentials: vi.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      graphBaseUrl: 'https://graph.microsoft.com/v1.0',
      defaultSiteUrl: 'https://bcgov.sharepoint.com/sites/TEST',
      maxRetries: 3,
      cacheTtlMinutes: 5,
    }),
    getNodeParameter: vi.fn().mockImplementation((name: string, fallback: unknown) => {
      if (name === 'site') return { mode: 'url', value: '' };
      return fallback;
    }),
    getNode: () => ({ name: 'BC Gov SharePoint' }),
    helpers: {
      httpRequestWithAuthentication: { call: httpMock },
    },
  };
}

describe('searchLists', () => {
  it('returns all lists when no filter is provided', async () => {
    const httpMock = vi
      .fn()
      // resolveSiteId: GET /sites/{host}:{path}
      .mockResolvedValueOnce({ id: 'site-1' })
      // graphPagedRequest: GET /sites/site-1/lists
      .mockResolvedValueOnce({
        value: [
          { id: 'list-a', displayName: 'Alpha' },
          { id: 'list-b', displayName: 'Beta' },
        ],
      });
    const ctx = makeLoadOptionsFunctions(httpMock);

    const result = await searchLists.call(ctx as never, undefined);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({ name: 'Alpha', value: 'list-a' });
    expect(result.results[1]).toEqual({ name: 'Beta', value: 'list-b' });
  });

  it('filters results by substring match when filter is provided', async () => {
    const httpMock = vi
      .fn()
      .mockResolvedValueOnce({ id: 'site-1' })
      .mockResolvedValueOnce({
        value: [
          { id: 'list-a', displayName: 'Alpha' },
          { id: 'list-b', displayName: 'Beta' },
          { id: 'list-c', displayName: 'Alphabetical' },
        ],
      });
    const ctx = makeLoadOptionsFunctions(httpMock);

    const result = await searchLists.call(ctx as never, 'alpha');

    expect(result.results).toHaveLength(2);
    expect(result.results.map((r) => r.name)).toEqual(['Alpha', 'Alphabetical']);
  });
});

describe('searchDrives', () => {
  it('returns all drives for the resolved site', async () => {
    const httpMock = vi
      .fn()
      .mockResolvedValueOnce({ id: 'site-1' })
      .mockResolvedValueOnce({
        value: [
          { id: 'drive-1', name: 'Documents' },
          { id: 'drive-2', name: 'Shared Files' },
        ],
      });
    const ctx = makeLoadOptionsFunctions(httpMock);

    const result = await searchDrives.call(ctx as never);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({ name: 'Documents', value: 'drive-1' });
    expect(result.results[1]).toEqual({ name: 'Shared Files', value: 'drive-2' });
  });
});
