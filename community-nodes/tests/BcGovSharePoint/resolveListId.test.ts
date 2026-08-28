import { describe, expect, it, vi } from 'vitest';
import { resolveListId } from '../../nodes/BcGovSharePoint/transport/resolve';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('resolveListId', () => {
  it('passes an ID straight through', async () => {
    const httpRequestWithAuthentication = vi.fn();
    const context = makeContext(httpRequestWithAuthentication);

    const result = await resolveListId(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      mode: 'id',
      value: 'list-1',
    });

    expect(result).toBe('list-1');
    expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
  });

  it('resolves by name via the $filter query when it succeeds', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValue({ value: [{ id: 'list-1', displayName: 'Section24Referrals' }] });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await resolveListId(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      mode: 'name',
      value: 'Section24Referrals',
    });

    expect(result).toBe('list-1');
    expect(httpRequestWithAuthentication).toHaveBeenCalledOnce();
  });

  it('falls back to paged enumeration + case-insensitive match when the filter fails', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 400 })
      .mockResolvedValueOnce({
        value: [
          { id: 'list-1', displayName: 'Other List' },
          { id: 'list-2', displayName: 'section24referrals' },
        ],
      });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await resolveListId(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      mode: 'name',
      value: 'Section24Referrals',
    });

    expect(result).toBe('list-2');
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
  });

  it('falls back to paged enumeration when the filter returns no match', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [{ id: 'list-2', displayName: 'Section24Referrals' }] });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await resolveListId(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      mode: 'name',
      value: 'Section24Referrals',
    });

    expect(result).toBe('list-2');
  });

  it('falls back to paged enumeration when the filter is silently ignored and returns a non-matching list', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      // Graph ignores the unsupported $filter and returns the full (unfiltered) list collection.
      .mockResolvedValueOnce({
        value: [
          { id: 'wrong-list', displayName: 'Other List' },
          { id: 'list-2', displayName: 'Section24Referrals' },
        ],
      })
      .mockResolvedValueOnce({
        value: [
          { id: 'wrong-list', displayName: 'Other List' },
          { id: 'list-2', displayName: 'Section24Referrals' },
        ],
      });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await resolveListId(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      mode: 'name',
      value: 'Section24Referrals',
    });

    expect(result).toBe('list-2');
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
  });

  it('throws an actionable NodeOperationError listing available lists when nothing matches', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [{ id: 'list-1', displayName: 'Other List' }] });
    const context = makeContext(httpRequestWithAuthentication);

    await expect(
      resolveListId(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
        mode: 'name',
        value: 'Missing List',
      }),
    ).rejects.toThrow(/Missing List.*not found.*Other List/s);
  });
});
