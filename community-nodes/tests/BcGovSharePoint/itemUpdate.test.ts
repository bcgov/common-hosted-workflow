import { describe, expect, it, vi } from 'vitest';
import { updateItem } from '../../nodes/BcGovSharePoint/actions/item/update';
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

describe('updateItem', () => {
  it('coerces fields and PATCHes the item fields endpoint', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ Title: 'Updated' });
    const context = makeContext(httpRequestWithAuthentication);
    const map = columnMap([{ internalName: 'Title', displayName: 'Title', type: 'text', required: false }]);

    const result = await updateItem(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-1',
      '42',
      map,
      {
        Title: 'Updated',
      },
    );

    expect(result).toEqual({ Title: 'Updated' });
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/lists/list-1/items/42/fields',
      body: { Title: 'Updated' },
    });
  });

  it('sends an If-Match header when an ETag is supplied', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({});
    const context = makeContext(httpRequestWithAuthentication);
    const map = columnMap([{ internalName: 'Title', displayName: 'Title', type: 'text', required: false }]);

    await updateItem(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-1',
      '42',
      map,
      { Title: 'Updated' },
      { ifMatchEtag: 'W/"1"' },
    );

    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      headers: { 'If-Match': 'W/"1"' },
    });
  });

  it('omits the If-Match header when no ETag is supplied', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({});
    const context = makeContext(httpRequestWithAuthentication);
    const map = columnMap([{ internalName: 'Title', displayName: 'Title', type: 'text', required: false }]);

    await updateItem(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', 'list-1', '42', map, {
      Title: 'Updated',
    });

    expect(httpRequestWithAuthentication.mock.calls[0][1].headers).toBeUndefined();
  });
});
