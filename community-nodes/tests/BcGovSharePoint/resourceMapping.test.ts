import { describe, expect, it, vi } from 'vitest';
import { getListColumns } from '../../nodes/BcGovSharePoint/methods/resourceMapping';

function makeLoadOptionsFunctions(httpMock: ReturnType<typeof vi.fn>) {
  return {
    getCredentials: vi.fn().mockResolvedValue({
      graphBaseUrl: 'https://graph.microsoft.com/v1.0',
      defaultSiteUrl: 'https://bcgov.sharepoint.com/sites/TEST',
      maxRetries: 3,
    }),
    getNodeParameter: vi.fn().mockImplementation((name: string, fallback: unknown) => {
      if (name === 'site') return { mode: 'url', value: '' };
      if (name === 'list') return { mode: 'name', value: 'MyList' };
      return fallback;
    }),
    getNode: () => ({ name: 'BC Gov SharePoint' }),
    helpers: {
      httpRequestWithAuthentication: { call: httpMock },
    },
  };
}

const COLUMNS_RESPONSE = {
  value: [
    { name: 'Title', displayName: 'Title', readOnly: false, required: true, text: {} },
    { name: 'Amount', displayName: 'Budget Amount', readOnly: false, required: false, number: {} },
    { name: 'DueDate', displayName: 'Due Date', readOnly: false, required: false, dateTime: {} },
    { name: 'Active', displayName: 'Active', readOnly: false, required: false, boolean: {} },
    {
      name: 'Status',
      displayName: 'Status',
      readOnly: false,
      required: false,
      choice: { choices: ['Open', 'Closed', 'Pending'] },
    },
    // Read-only column — should be excluded from the writable column map
    { name: 'ID', displayName: 'ID', readOnly: true, required: false, calculated: {} },
    { name: 'Created', displayName: 'Created', readOnly: true, required: false, dateTime: {} },
  ],
};

describe('getListColumns (resourceMapping)', () => {
  it('transforms the column map into ResourceMapperFields with correct types', async () => {
    const httpMock = vi
      .fn()
      // resolveSiteId
      .mockResolvedValueOnce({ id: 'site-1' })
      // resolveListId — filtered list lookup
      .mockResolvedValueOnce({ value: [{ id: 'list-1', displayName: 'MyList' }] })
      // getColumnMap — GET columns
      .mockResolvedValueOnce(COLUMNS_RESPONSE);
    const ctx = makeLoadOptionsFunctions(httpMock);

    const result = await getListColumns.call(ctx as never);

    expect(result.fields.length).toBeGreaterThanOrEqual(4);
    // Read-only columns (ID, Created) should NOT appear
    expect(result.fields.find((f) => f.id === 'ID')).toBeUndefined();
    expect(result.fields.find((f) => f.id === 'Created')).toBeUndefined();

    const titleField = result.fields.find((f) => f.id === 'Title');
    expect(titleField).toBeDefined();
    expect(titleField!.displayName).toBe('Title');
    expect(titleField!.required).toBe(true);
    expect(titleField!.defaultMatch).toBe(true);
    expect(titleField!.type).toBe('string');

    const amountField = result.fields.find((f) => f.id === 'Amount');
    expect(amountField).toBeDefined();
    expect(amountField!.displayName).toBe('Budget Amount');
    expect(amountField!.type).toBe('number');

    const dateField = result.fields.find((f) => f.id === 'DueDate');
    expect(dateField!.type).toBe('dateTime');

    const boolField = result.fields.find((f) => f.id === 'Active');
    expect(boolField!.type).toBe('boolean');
  });

  it('includes choice options for choice columns', async () => {
    const httpMock = vi
      .fn()
      .mockResolvedValueOnce({ id: 'site-1' })
      .mockResolvedValueOnce({ value: [{ id: 'list-1', displayName: 'MyList' }] })
      .mockResolvedValueOnce(COLUMNS_RESPONSE);
    const ctx = makeLoadOptionsFunctions(httpMock);

    const result = await getListColumns.call(ctx as never);

    const statusField = result.fields.find((f) => f.id === 'Status');
    expect(statusField).toBeDefined();
    expect(statusField!.options).toEqual([
      { name: 'Open', value: 'Open' },
      { name: 'Closed', value: 'Closed' },
      { name: 'Pending', value: 'Pending' },
    ]);
  });
});
