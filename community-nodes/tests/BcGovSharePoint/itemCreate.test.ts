import { describe, expect, it, vi } from 'vitest';
import { createItem } from '../../nodes/BcGovSharePoint/actions/item/create';
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

describe('createItem', () => {
  it('coerces fields and POSTs them to the items endpoint', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: '99', fields: { Title: 'Referral A' } });
    const context = makeContext(httpRequestWithAuthentication);
    const map = columnMap([{ internalName: 'Title', displayName: 'Title', type: 'text', required: false }]);

    const result = await createItem(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-1',
      map,
      { Title: 'Referral A' },
    );

    expect(result).toEqual({ id: '99', fields: { Title: 'Referral A' } });
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/lists/list-1/items',
      body: { fields: { Title: 'Referral A' } },
    });
  });

  it('propagates an unwritable-field error from coerceFieldsForWrite without calling the API', async () => {
    const httpRequestWithAuthentication = vi.fn();
    const context = makeContext(httpRequestWithAuthentication);
    const map = columnMap([{ internalName: 'Title', displayName: 'Title', type: 'text', required: false }]);

    await expect(
      createItem(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', 'list-1', map, {
        Bogus: 'value',
      }),
    ).rejects.toThrow(/Bogus/);
    expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
  });
});
