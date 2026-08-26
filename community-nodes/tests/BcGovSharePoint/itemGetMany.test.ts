import { describe, expect, it, vi } from 'vitest';
import { compileSimpleFilter, getManyItems } from '../../nodes/BcGovSharePoint/actions/item/getMany';
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

describe('compileSimpleFilter', () => {
  const map = columnMap([{ internalName: 'OData__x0043_oors', displayName: 'COORS #', type: 'text', required: false }]);

  it('resolves a display name to its internal name and compiles an eq clause', () => {
    expect(compileSimpleFilter(map, [{ column: 'COORS #', operator: 'eq', value: '12345' }])).toBe(
      "fields/OData__x0043_oors eq '12345'",
    );
  });

  it('compiles startswith/contains as function calls', () => {
    expect(compileSimpleFilter(map, [{ column: 'COORS #', operator: 'startswith', value: '123' }])).toBe(
      "startswith(fields/OData__x0043_oors, '123')",
    );
  });

  it('AND-composes multiple conditions', () => {
    const twoCol = columnMap([
      { internalName: 'Field1', displayName: 'Field 1', type: 'text', required: false },
      { internalName: 'Field2', displayName: 'Field 2', type: 'text', required: false },
    ]);
    expect(
      compileSimpleFilter(twoCol, [
        { column: 'Field 1', operator: 'eq', value: 'a' },
        { column: 'Field 2', operator: 'eq', value: 'b' },
      ]),
    ).toBe("fields/Field1 eq 'a' and fields/Field2 eq 'b'");
  });

  it('escapes single quotes in the value', () => {
    expect(compileSimpleFilter(map, [{ column: 'COORS #', operator: 'eq', value: "O'Brien" }])).toBe(
      "fields/OData__x0043_oors eq 'O''Brien'",
    );
  });

  it('falls back to treating an unmapped column key as an internal name directly', () => {
    expect(compileSimpleFilter(map, [{ column: 'RawInternalName', operator: 'eq', value: 'x' }])).toBe(
      "fields/RawInternalName eq 'x'",
    );
  });
});

describe('getManyItems', () => {
  const map = columnMap([{ internalName: 'Field1', displayName: 'Field 1', type: 'text', required: false }]);

  it('fetches without a filter when filterMode is none', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ value: [{ id: '1' }] });
    const context = makeContext(httpRequestWithAuthentication);

    await getManyItems(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', 'list-1', map, {
      filterMode: 'none',
      returnAll: false,
    });

    expect(httpRequestWithAuthentication.mock.calls[0][1].qs.$filter).toBeUndefined();
  });

  it('compiles a simple filter into $filter', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ value: [] });
    const context = makeContext(httpRequestWithAuthentication);

    await getManyItems(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', 'list-1', map, {
      filterMode: 'simple',
      simpleConditions: [{ column: 'Field 1', operator: 'eq', value: 'x' }],
      returnAll: false,
    });

    expect(httpRequestWithAuthentication.mock.calls[0][1].qs.$filter).toBe("fields/Field1 eq 'x'");
  });

  it('passes an OData filter straight through', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ value: [] });
    const context = makeContext(httpRequestWithAuthentication);

    await getManyItems(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', 'list-1', map, {
      filterMode: 'odata',
      odataFilter: "fields/Field1 eq 'raw'",
      returnAll: false,
    });

    expect(httpRequestWithAuthentication.mock.calls[0][1].qs.$filter).toBe("fields/Field1 eq 'raw'");
  });

  it('sends the non-indexed-query Prefer header on every call', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ value: [] });
    const context = makeContext(httpRequestWithAuthentication);

    await getManyItems(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', 'list-1', map, {
      filterMode: 'none',
      returnAll: false,
    });

    expect(httpRequestWithAuthentication.mock.calls[0][1].headers).toMatchObject({
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    });
  });

  it('honours returnAll/limit via graphPagedRequest', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: '1' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' })
      .mockResolvedValueOnce({ value: [{ id: '2' }] });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await getManyItems(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-1',
      map,
      {
        filterMode: 'none',
        returnAll: true,
      },
    );

    expect(result).toEqual([{ id: '1' }, { id: '2' }]);
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
  });
});
