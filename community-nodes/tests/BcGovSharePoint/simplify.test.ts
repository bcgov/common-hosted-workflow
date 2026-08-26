import { describe, expect, it } from 'vitest';
import { simplifyItem, simplifyItems } from '../../nodes/BcGovSharePoint/transport/simplify';
import type { ColumnMap } from '../../nodes/BcGovSharePoint/transport/resolve';

function makeColumnMap(): ColumnMap {
  const byDisplayName = new Map();
  const byInternalName = new Map();

  const entries = [
    { internalName: 'Title', displayName: 'Title', type: 'text', required: true },
    { internalName: 'OData__x0043_oors__x0023_', displayName: 'COORS #', type: 'text', required: false },
    { internalName: 'Amount', displayName: 'Budget Amount', type: 'number', required: false },
  ];

  for (const entry of entries) {
    byDisplayName.set(entry.displayName.toLowerCase(), entry);
    byInternalName.set(entry.internalName, entry);
  }

  return { byDisplayName, byInternalName };
}

describe('simplifyItem', () => {
  it('flattens fields to root and re-keys internal names to display names', () => {
    const columnMap = makeColumnMap();
    const rawItem = {
      id: '42',
      createdDateTime: '2026-01-01T00:00:00Z',
      fields: {
        Title: 'Test Item',
        OData__x0043_oors__x0023_: 'ABC-123',
        Amount: 5000,
      },
    };

    const result = simplifyItem(rawItem, columnMap);

    expect(result).toEqual({
      id: '42',
      Title: 'Test Item',
      'COORS #': 'ABC-123',
      'Budget Amount': 5000,
    });
  });

  it('passes through fields not in the column map with their original key', () => {
    const columnMap = makeColumnMap();
    const rawItem = {
      id: '1',
      fields: {
        Title: 'Hello',
        '@odata.etag': '"abc"',
        UnknownField: 'mystery',
      },
    };

    const result = simplifyItem(rawItem, columnMap);

    expect(result.Title).toBe('Hello');
    expect(result['@odata.etag']).toBe('"abc"');
    expect(result.UnknownField).toBe('mystery');
  });
});

describe('simplifyItems', () => {
  it('simplifies an array of items', () => {
    const columnMap = makeColumnMap();
    const items = [
      { id: '1', fields: { Title: 'A', Amount: 10 } },
      { id: '2', fields: { Title: 'B', Amount: 20 } },
    ];

    const result = simplifyItems(items, columnMap);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: '1', Title: 'A', 'Budget Amount': 10 });
    expect(result[1]).toEqual({ id: '2', Title: 'B', 'Budget Amount': 20 });
  });
});
