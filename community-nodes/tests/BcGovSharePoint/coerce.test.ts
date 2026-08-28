import { describe, expect, it, vi } from 'vitest';
import { NodeApiError } from 'n8n-workflow';
import {
  coerceDateTime,
  coerceBoolean,
  coerceNumber,
  coerceHyperlink,
  findColumnEntry,
  coerceFieldValue,
  coerceFieldsForWrite,
} from '../../nodes/BcGovSharePoint/transport/coerce';
import type { ColumnMap, ColumnMapEntry } from '../../nodes/BcGovSharePoint/transport/resolve';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

function entry(overrides: Partial<ColumnMapEntry>): ColumnMapEntry {
  return { internalName: 'Field1', displayName: 'Field 1', type: 'text', required: false, ...overrides };
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

describe('coerceDateTime', () => {
  it('accepts a Luxon-shaped DateTime object via toISO()', () => {
    const luxonLike = { toISO: () => '2026-01-15T10:00:00.000Z' };
    expect(coerceDateTime('Due Date', luxonLike)).toBe('2026-01-15T10:00:00.000Z');
  });

  it('accepts a native JS Date', () => {
    const date = new Date('2026-01-15T00:00:00.000Z');
    expect(coerceDateTime('Due Date', date)).toBe('2026-01-15T00:00:00.000Z');
  });

  it('accepts epoch milliseconds', () => {
    expect(coerceDateTime('Due Date', 1768464000000)).toBe(new Date(1768464000000).toISOString());
  });

  it('accepts a yyyy-MM-dd string as UTC midnight', () => {
    expect(coerceDateTime('Due Date', '2026-01-15')).toBe('2026-01-15T00:00:00.000Z');
  });

  it('accepts an ISO string directly', () => {
    expect(coerceDateTime('Due Date', '2026-01-15T10:30:00.000Z')).toBe('2026-01-15T10:30:00.000Z');
  });

  it('rejects an unparseable value', () => {
    expect(() => coerceDateTime('Due Date', 'not a date')).toThrow(/Due Date/);
  });
});

describe('coerceBoolean', () => {
  it.each([
    [true, true],
    [false, false],
    ['yes', true],
    ['No', false],
    ['1', true],
    ['0', false],
    [1, true],
    [0, false],
  ])('coerces %j to %j', (input, expected) => {
    expect(coerceBoolean('Active', input)).toBe(expected);
  });

  it('rejects an unrecognized string', () => {
    expect(() => coerceBoolean('Active', 'maybe')).toThrow(/Active/);
  });
});

describe('coerceNumber', () => {
  it('coerces a numeric string', () => {
    expect(coerceNumber('Amount', '42.5')).toBe(42.5);
  });

  it('passes through a number', () => {
    expect(coerceNumber('Amount', 7)).toBe(7);
  });

  it('rejects NaN', () => {
    expect(() => coerceNumber('Amount', 'abc')).toThrow(/Amount/);
  });
});

describe('coerceHyperlink', () => {
  it('accepts a bare URL string, using it as both Description and Url', () => {
    expect(coerceHyperlink('Link', 'https://example.com')).toEqual({
      Description: 'https://example.com',
      Url: 'https://example.com',
    });
  });

  it('accepts an object with url and description', () => {
    expect(coerceHyperlink('Link', { url: 'https://example.com', description: 'Example' })).toEqual({
      Description: 'Example',
      Url: 'https://example.com',
    });
  });

  it('rejects a value with no usable url', () => {
    expect(() => coerceHyperlink('Link', { description: 'Example' })).toThrow(/Link/);
  });
});

describe('findColumnEntry', () => {
  it('matches by display name case-insensitively first', () => {
    const map = columnMap([entry({ internalName: 'Field1', displayName: 'Field 1' })]);
    expect(findColumnEntry(map, 'field 1')?.internalName).toBe('Field1');
  });

  it('falls back to internal name', () => {
    const map = columnMap([entry({ internalName: 'Field1', displayName: 'Field 1' })]);
    expect(findColumnEntry(map, 'Field1')?.internalName).toBe('Field1');
  });

  it('returns undefined for an unknown key', () => {
    const map = columnMap([entry({ internalName: 'Field1', displayName: 'Field 1' })]);
    expect(findColumnEntry(map, 'Missing')).toBeUndefined();
  });
});

describe('coerceFieldValue', () => {
  it('writes a scalar text field under its internal name', async () => {
    const context = makeContext(vi.fn());
    const result = await coerceFieldValue(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      entry({ internalName: 'Field1', type: 'text' }),
      'hello',
    );
    expect(result).toEqual({ Field1: 'hello' });
  });

  it('writes a multi-choice field with the @odata.type sibling key', async () => {
    const context = makeContext(vi.fn());
    const result = await coerceFieldValue(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      entry({ internalName: 'Choice1', type: 'choice', allowMultiple: true }),
      ['A', 'B'],
    );
    expect(result).toEqual({
      'Choice1@odata.type': 'Collection(Edm.String)',
      Choice1: ['A', 'B'],
    });
  });

  it('resolves a single personOrGroup field to InternalLookupId via resolvePersonLookupId', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: 'userlist-1', displayName: 'User Information List' }] })
      .mockResolvedValueOnce({
        value: [{ id: '12', fields: { EMail: 'jane@gov.bc.ca', UserName: 'jane@gov.bc.ca', Title: 'Jane' } }],
      });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await coerceFieldValue(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      entry({ internalName: 'Officer', type: 'personOrGroup' }),
      'jane@gov.bc.ca',
    );
    expect(result).toEqual({ OfficerLookupId: 12 });
  });

  it('resolves a multi lookup field to InternalLookupId with Collection(Edm.Int32)', async () => {
    const httpRequestWithAuthentication = vi
      .fn()
      .mockResolvedValueOnce({ value: [{ id: '1' }] })
      .mockResolvedValueOnce({ value: [{ id: '2' }] });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await coerceFieldValue(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      entry({
        internalName: 'Related',
        type: 'lookup',
        allowMultiple: true,
        lookup: { listId: 'list-2', column: 'Title' },
      }),
      ['Item A', 'Item B'],
    );
    expect(result).toEqual({
      'RelatedLookupId@odata.type': 'Collection(Edm.Int32)',
      RelatedLookupId: [1, 2],
    });
  });

  it('throws when a lookup column has no target list configured', async () => {
    const context = makeContext(vi.fn());
    await expect(
      coerceFieldValue(
        context,
        'https://graph.microsoft.com/v1.0',
        { maxRetries: 1 },
        'site-1',
        entry({ internalName: 'Related', type: 'lookup', lookup: {} }),
        'Item A',
      ),
    ).rejects.toThrow(/Related/);
  });
});

describe('coerceFieldsForWrite', () => {
  it('coerces multiple fields keyed by display name into an internal-name payload', async () => {
    const context = makeContext(vi.fn());
    const map = columnMap([
      entry({ internalName: 'Field1', displayName: 'Field 1', type: 'text' }),
      entry({ internalName: 'Amount', displayName: 'Amount', type: 'number' }),
    ]);
    const result = await coerceFieldsForWrite(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      map,
      {
        'Field 1': 'hello',
        Amount: '42',
      },
    );
    expect(result).toEqual({ Field1: 'hello', Amount: 42 });
  });

  it('skips null/undefined values without erroring', async () => {
    const context = makeContext(vi.fn());
    const map = columnMap([entry({ internalName: 'Field1', displayName: 'Field 1', type: 'text' })]);
    const result = await coerceFieldsForWrite(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      map,
      {
        'Field 1': null,
      },
    );
    expect(result).toEqual({});
  });

  it('throws an actionable NodeOperationError naming known writable fields for an unknown key', async () => {
    const context = makeContext(vi.fn());
    const map = columnMap([entry({ internalName: 'Field1', displayName: 'Field 1', type: 'text' })]);
    await expect(
      coerceFieldsForWrite(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', map, {
        Bogus: 'value',
      }),
    ).rejects.toThrow(/Bogus.*Field 1/s);
  });

  it('wraps a coercion failure (e.g. bad number) in a NodeOperationError naming the field', async () => {
    const context = makeContext(vi.fn());
    const map = columnMap([entry({ internalName: 'Amount', displayName: 'Amount', type: 'number' })]);
    await expect(
      coerceFieldsForWrite(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', map, {
        Amount: 'not-a-number',
      }),
    ).rejects.toThrow(/Amount/);
  });

  it('rethrows a NodeApiError from Person/Lookup resolution unchanged, not double-wrapped in a NodeOperationError', async () => {
    const httpRequestWithAuthentication = vi.fn().mockRejectedValue({ statusCode: 403, response: { headers: {} } });
    const context = makeContext(httpRequestWithAuthentication);
    const map = columnMap([entry({ internalName: 'Officer', displayName: 'Officer', type: 'personOrGroup' })]);

    await expect(
      coerceFieldsForWrite(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', map, {
        Officer: 'jane@gov.bc.ca',
      }),
    ).rejects.toBeInstanceOf(NodeApiError);
  });
});
