import { describe, expect, it, vi } from 'vitest';
import { getManyUsers } from '../../nodes/BcGovSharePoint/actions/user/getMany';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

const USERS_RESPONSE = {
  value: [
    { id: '1', fields: { EMail: 'alice@gov.bc.ca', UserName: 'alice', Title: 'Alice A', ContentType: 'Person' } },
    { id: '2', fields: { EMail: '', UserName: 'SHAREPOINT\\system', Title: 'System', ContentType: 'SharePointGroup' } },
    { id: '3', fields: { EMail: 'bob@gov.bc.ca', UserName: 'bob', Title: 'Bob B', ContentType: 'Person' } },
  ],
};

function makeMock() {
  return (
    vi
      .fn()
      // First call: resolveListId — GET /sites/.../lists?$filter=...
      .mockResolvedValueOnce({ value: [{ id: 'user-list-id', displayName: 'User Information List' }] })
      // Second call: graphPagedRequest — GET /sites/.../lists/user-list-id/items
      .mockResolvedValueOnce(USERS_RESPONSE)
  );
}

describe('getManyUsers', () => {
  it('returns only Person entries when excludeSystemAccounts is true', async () => {
    const mock = makeMock();
    const context = makeContext(mock);

    const result = await getManyUsers(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      excludeSystemAccounts: true,
      returnAll: true,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, email: 'alice@gov.bc.ca', displayName: 'Alice A' });
    expect(result[1]).toMatchObject({ id: 3, email: 'bob@gov.bc.ca', displayName: 'Bob B' });
  });

  it('returns all entries (including system) when excludeSystemAccounts is false', async () => {
    const mock = makeMock();
    const context = makeContext(mock);

    const result = await getManyUsers(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      excludeSystemAccounts: false,
      returnAll: true,
    });

    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({ id: 2, contentType: 'SharePointGroup' });
  });

  it('respects limit after filtering', async () => {
    const mock = makeMock();
    const context = makeContext(mock);

    const result = await getManyUsers(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      excludeSystemAccounts: true,
      returnAll: false,
      limit: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ email: 'alice@gov.bc.ca' });
  });
});
