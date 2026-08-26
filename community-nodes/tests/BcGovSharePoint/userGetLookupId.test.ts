import { describe, expect, it, vi } from 'vitest';
import { getUserLookupId } from '../../nodes/BcGovSharePoint/actions/user/getLookupId';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('getUserLookupId', () => {
  it('returns the resolved lookup on a match', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: 'userlist-1', displayName: 'User Information List' }] })
      .mockResolvedValueOnce({
        value: [{ id: '12', fields: { EMail: 'jane@gov.bc.ca', UserName: 'jane@gov.bc.ca', Title: 'Jane' } }],
      });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await getUserLookupId(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'jane@gov.bc.ca',
      'error',
    );

    expect(result).toEqual({ email: 'jane@gov.bc.ca', lookupId: 12, displayName: 'Jane', userName: 'jane@gov.bc.ca' });
  });

  it('throws when onNotFound is "error" and no match is found', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: 'userlist-1', displayName: 'User Information List' }] })
      .mockResolvedValueOnce({ value: [] });
    const context = makeContext(httpRequestWithAuthentication);

    await expect(
      getUserLookupId(
        context,
        'https://graph.microsoft.com/v1.0',
        { maxRetries: 1 },
        'site-1',
        'missing@gov.bc.ca',
        'error',
      ),
    ).rejects.toThrow(/missing@gov\.bc\.ca/);
  });

  it('returns null when onNotFound is "continue" and no match is found', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: 'userlist-1', displayName: 'User Information List' }] })
      .mockResolvedValueOnce({ value: [] });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await getUserLookupId(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'missing@gov.bc.ca',
      'continue',
    );

    expect(result).toBeNull();
  });
});
