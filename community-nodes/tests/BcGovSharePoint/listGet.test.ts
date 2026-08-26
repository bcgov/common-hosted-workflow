import { describe, expect, it, vi } from 'vitest';
import { getList } from '../../nodes/BcGovSharePoint/actions/list/get';
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

describe('getList', () => {
  it('fetches list metadata without a column map when none is supplied', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: 'list-1', displayName: 'Referrals' });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await getList(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', 'list-1');

    expect(result).toEqual({ id: 'list-1', displayName: 'Referrals' });
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/lists/list-1',
    });
  });

  it('attaches a display-name -> internal-name column map when supplied', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: 'list-1', displayName: 'Referrals' });
    const context = makeContext(httpRequestWithAuthentication);
    const map = columnMap([{ internalName: 'Title', displayName: 'Title', type: 'text', required: false }]);

    const result = await getList(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-1',
      map,
    );

    expect(result).toEqual({
      id: 'list-1',
      displayName: 'Referrals',
      columnMap: { Title: 'Title' },
    });
  });
});
