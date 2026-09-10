import { describe, expect, it, vi } from 'vitest';
import { getUserByLookupId, parseLookupIds } from '../../nodes/SiteSelectedSharepoint/actions/user/getByLookupId';

const BASE_URL = 'https://graph.microsoft.com/v1.0';
const RETRY = { maxRetries: 1 };
const USER_LIST_RESPONSE = { value: [{ id: 'userlist-1', displayName: 'User Information List' }] };

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'Site Selected SharePoint' }),
  };
}

function userItem(id: string, email: string, title: string) {
  return { id, fields: { EMail: email, UserName: email, Title: title } };
}

describe('parseLookupIds', () => {
  const context = makeContext(vi.fn());

  it('parses a single id', () => {
    expect(parseLookupIds(context, '17')).toEqual([17]);
  });

  it('parses and deduplicates a comma-separated list preserving order', () => {
    expect(parseLookupIds(context, '17, 16, 17, 5')).toEqual([17, 16, 5]);
  });

  it('rejects non-numeric or non-positive tokens', () => {
    expect(() => parseLookupIds(context, '17,abc')).toThrow(/not a valid SharePoint LookupId/);
    expect(() => parseLookupIds(context, '0')).toThrow(/not a valid SharePoint LookupId/);
  });
});

describe('getUserByLookupId', () => {
  it('resolves a single lookup id to its person details', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce(USER_LIST_RESPONSE)
      .mockResolvedValueOnce(userItem('17', 'jane@gov.bc.ca', 'Jane Doe'));
    const context = makeContext(httpRequestWithAuthentication);

    const result = await getUserByLookupId(context, BASE_URL, RETRY, 'site-1', '17', 'error');

    expect(result).toEqual([
      {
        requestedLookupId: 17,
        lookupId: 17,
        email: 'jane@gov.bc.ca',
        displayName: 'Jane Doe',
        userName: 'jane@gov.bc.ca',
      },
    ]);
  });

  it('deduplicates ids so the same principal is fetched once', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce(USER_LIST_RESPONSE)
      .mockResolvedValueOnce(userItem('17', 'jane@gov.bc.ca', 'Jane Doe'));
    const context = makeContext(httpRequestWithAuthentication);

    const result = await getUserByLookupId(context, BASE_URL, RETRY, 'site-1', '17,17', 'error');

    // 1 list-resolution call + exactly 1 item fetch (not 2).
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it('throws when onNotFound is "error" and the principal is missing (404)', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce(USER_LIST_RESPONSE)
      .mockRejectedValueOnce({ httpCode: '404' });
    const context = makeContext(httpRequestWithAuthentication);

    await expect(getUserByLookupId(context, BASE_URL, RETRY, 'site-1', '999', 'error')).rejects.toThrow(
      /No SharePoint principal found for LookupId 999/,
    );
  });

  it('returns empty fields when onNotFound is "continue" and the principal is missing (404)', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce(USER_LIST_RESPONSE)
      .mockRejectedValueOnce({ statusCode: 404 });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await getUserByLookupId(context, BASE_URL, RETRY, 'site-1', '999', 'continue');

    expect(result).toEqual([{ requestedLookupId: 999, lookupId: 999, email: '', displayName: '', userName: '' }]);
  });
});
