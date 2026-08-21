import { describe, expect, it, vi } from 'vitest';
import { createOrUpdateItem } from '../../nodes/BcGovSharePoint/actions/item/createOrUpdate';
import type { ColumnMap, ColumnMapEntry } from '../../nodes/BcGovSharePoint/transport/resolve';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

function columnMap(entries: ColumnMapEntry[]): ColumnMap {
  const byDisplayName = new Map<string, ColumnMapEntry>();
  const byInternalName = new Map<string, ColumnMapEntry>();
  for (const e of entries) {
    byDisplayName.set(e.displayName.toLowerCase(), e);
    byInternalName.set(e.internalName, e);
  }
  return { byDisplayName, byInternalName };
}

describe('createOrUpdateItem', () => {
  const map = columnMap([
    { internalName: 'Title', displayName: 'Title', type: 'text', required: false },
    { internalName: 'Status', displayName: 'Status', type: 'text', required: false },
  ]);

  it('updates the matched item when a match is found', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: '42' }] }) // match lookup
      .mockResolvedValueOnce({ Status: 'Closed' }); // PATCH response
    const context = makeContext(httpRequestWithAuthentication);

    const result = await createOrUpdateItem(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-1',
      map,
      { Status: 'Closed' },
      { Title: 'Referral A' },
    );

    expect(result).toEqual({ Status: 'Closed' });
    expect(httpRequestWithAuthentication.mock.calls[1][1]).toMatchObject({
      method: 'PATCH',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/lists/list-1/items/42/fields',
    });
  });

  it('creates a new item (merging match fields + rawFields) when no match is found', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [] }) // match lookup, no results
      .mockResolvedValueOnce({ id: '99' }); // POST response
    const context = makeContext(httpRequestWithAuthentication);

    const result = await createOrUpdateItem(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-1',
      map,
      { Status: 'Open' },
      { Title: 'Referral A' },
    );

    expect(result).toEqual({ id: '99' });
    expect(httpRequestWithAuthentication.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: { fields: { Title: 'Referral A', Status: 'Open' } },
    });
  });

  it('AND-composes multiple match fields', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: '1' }] })
      .mockResolvedValueOnce({});
    const context = makeContext(httpRequestWithAuthentication);

    await createOrUpdateItem(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-1',
      map,
      {},
      { Title: 'Referral A', Status: 'Open' },
    );

    expect(httpRequestWithAuthentication.mock.calls[0][1].qs).toEqual({
      $expand: 'fields',
      $filter: "fields/Title eq 'Referral A' and fields/Status eq 'Open'",
    });
  });

  it('throws a NodeOperationError when no match fields are supplied', async () => {
    const httpRequestWithAuthentication = vi.fn();
    const context = makeContext(httpRequestWithAuthentication);

    await expect(
      createOrUpdateItem(
        context,
        'https://graph.microsoft.com/v1.0',
        { maxRetries: 1 },
        'site-1',
        'list-1',
        map,
        {},
        {},
      ),
    ).rejects.toThrow(/match field/i);
    expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
  });
});
