import { describe, expect, it, vi } from 'vitest';
import { graphPagedRequest } from '../../nodes/BcGovSharePoint/transport/graphRequest';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('graphPagedRequest', () => {
  it('returns a single page when returnAll is false and no limit is set', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ value: [{ id: '1' }, { id: '2' }] });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await graphPagedRequest(
      context,
      { method: 'GET', url: 'https://graph.example/lists' },
      { maxRetries: 1 },
      { returnAll: false },
    );

    expect(result).toEqual([{ id: '1' }, { id: '2' }]);
    expect(httpRequestWithAuthentication).toHaveBeenCalledOnce();
  });

  it('follows @odata.nextLink across pages when returnAll is true', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: '1' }], '@odata.nextLink': 'https://graph.example/lists?skip=1' })
      .mockResolvedValueOnce({ value: [{ id: '2' }] });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await graphPagedRequest(
      context,
      { method: 'GET', url: 'https://graph.example/lists' },
      { maxRetries: 1 },
      { returnAll: true },
    );

    expect(result).toEqual([{ id: '1' }, { id: '2' }]);
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
    expect(httpRequestWithAuthentication.mock.calls[1][1]).toMatchObject({
      url: 'https://graph.example/lists?skip=1',
    });
  });

  it('stops once the limit is reached and truncates the result', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValueOnce({
      value: [{ id: '1' }, { id: '2' }],
      '@odata.nextLink': 'https://graph.example/lists?skip=2',
    });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await graphPagedRequest(
      context,
      { method: 'GET', url: 'https://graph.example/lists' },
      { maxRetries: 1 },
      { returnAll: false, limit: 1 },
    );

    expect(result).toEqual([{ id: '1' }]);
    expect(httpRequestWithAuthentication).toHaveBeenCalledOnce();
  });
});
