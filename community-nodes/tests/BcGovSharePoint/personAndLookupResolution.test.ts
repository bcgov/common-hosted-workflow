import { describe, expect, it, vi } from 'vitest';
import { resolvePersonLookupId, resolveLookupItemId } from '../../nodes/BcGovSharePoint/transport/resolve';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('resolvePersonLookupId', () => {
  it('resolves the User Information List then matches by email, case-insensitively', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      // resolveListId: filtered lookup for "User Information List"
      .mockResolvedValueOnce({ value: [{ id: 'userlist-1', displayName: 'User Information List' }] })
      // paged fetch of list items
      .mockResolvedValueOnce({
        value: [
          { id: '5', fields: { EMail: 'jane.doe@gov.bc.ca', UserName: 'jane.doe@gov.bc.ca', Title: 'Jane Doe' } },
          {
            id: '12',
            fields: { EMail: 'John.Smith@gov.bc.ca', UserName: 'john.smith@gov.bc.ca', Title: 'John Smith' },
          },
        ],
      });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await resolvePersonLookupId(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      '  JOHN.SMITH@gov.bc.ca  ',
    );

    expect(result).toEqual({
      email: '  JOHN.SMITH@gov.bc.ca  ',
      lookupId: 12,
      displayName: 'John Smith',
      userName: 'john.smith@gov.bc.ca',
    });
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      qs: expect.objectContaining({ includeHiddenLists: true }),
    });
  });

  it('throws an actionable error naming the email when no principal is found', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: 'userlist-1', displayName: 'User Information List' }] })
      .mockResolvedValueOnce({ value: [] });
    const context = makeContext(httpRequestWithAuthentication);

    await expect(
      resolvePersonLookupId(
        context,
        'https://graph.microsoft.com/v1.0',
        { maxRetries: 1 },
        'site-1',
        'missing@gov.bc.ca',
      ),
    ).rejects.toThrow(/missing@gov\.bc\.ca/);
  });
});

describe('resolveLookupItemId', () => {
  it('resolves a lookup item id by filtering the target list', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ value: [{ id: '42' }] });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await resolveLookupItemId(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-2',
      'Title',
      'Referral A',
    );

    expect(result).toBe(42);
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
    });
  });

  it('throws an actionable error when no matching item is found', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ value: [] });
    const context = makeContext(httpRequestWithAuthentication);

    await expect(
      resolveLookupItemId(
        context,
        'https://graph.microsoft.com/v1.0',
        { maxRetries: 1 },
        'site-1',
        'list-2',
        'Title',
        'Missing',
      ),
    ).rejects.toThrow(/Title.*Missing/);
  });
});
