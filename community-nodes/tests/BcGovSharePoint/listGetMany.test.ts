import { describe, expect, it, vi } from 'vitest';
import { getManyLists } from '../../nodes/BcGovSharePoint/actions/list/getMany';
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

describe('getManyLists', () => {
  it('fetches lists without hidden lists by default', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValue({ value: [{ id: 'list-1', displayName: 'Referrals' }] });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await getManyLists(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      includeHiddenLists: false,
      returnAll: false,
    });

    expect(result).toEqual([{ id: 'list-1', displayName: 'Referrals' }]);
    expect(httpRequestWithAuthentication.mock.calls[0][1].qs.includeHiddenLists).toBeUndefined();
  });

  it('honours returnAll/limit via graphPagedRequest', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: 'list-1' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' })
      .mockResolvedValueOnce({ value: [{ id: 'list-2' }] });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await getManyLists(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      includeHiddenLists: false,
      returnAll: true,
    });

    expect(result).toEqual([{ id: 'list-1' }, { id: 'list-2' }]);
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
  });

  it('attaches a column map per list when a resolver callback is supplied', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({
      value: [
        { id: 'list-1', displayName: 'Referrals' },
        { id: 'list-2', displayName: 'Officers' },
      ],
    });
    const context = makeContext(httpRequestWithAuthentication);
    const map1 = columnMap([{ internalName: 'Title', displayName: 'Title', type: 'text', required: false }]);
    const map2 = columnMap([
      { internalName: 'OData__x0043_oors', displayName: 'COORS #', type: 'text', required: false },
    ]);
    const getColumnMapForList = vi.fn(async (listId: string) => (listId === 'list-1' ? map1 : map2));

    const result = await getManyLists(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      { includeHiddenLists: false, returnAll: false },
      getColumnMapForList,
    );

    expect(result).toEqual([
      { id: 'list-1', displayName: 'Referrals', columnMap: { Title: 'Title' } },
      { id: 'list-2', displayName: 'Officers', columnMap: { 'COORS #': 'OData__x0043_oors' } },
    ]);
    expect(getColumnMapForList).toHaveBeenCalledWith('list-1');
    expect(getColumnMapForList).toHaveBeenCalledWith('list-2');
  });
});
