import { describe, expect, it, vi } from 'vitest';
import { resolveDriveId, getColumnMap } from '../../nodes/BcGovSharePoint/transport/resolve';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('resolveDriveId', () => {
  it('passes an ID straight through', async () => {
    const httpRequestWithAuthentication = vi.fn();
    const context = makeContext(httpRequestWithAuthentication);
    const result = await resolveDriveId(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      mode: 'id',
      value: 'drive-1',
    });
    expect(result).toBe('drive-1');
    expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
  });

  it('resolves the default drive via GET /sites/{id}/drive', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: 'drive-default' });
    const context = makeContext(httpRequestWithAuthentication);
    const result = await resolveDriveId(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      mode: 'default',
    });
    expect(result).toBe('drive-default');
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/drive',
    });
  });

  it('resolves a named drive by case-insensitive match', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({
      value: [
        { id: 'drive-1', name: 'Documents' },
        { id: 'drive-2', name: 'Referral Files' },
      ],
    });
    const context = makeContext(httpRequestWithAuthentication);
    const result = await resolveDriveId(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
      mode: 'name',
      value: 'referral files',
    });
    expect(result).toBe('drive-2');
  });

  it('throws an actionable error naming available libraries when no match', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ value: [{ id: 'drive-1', name: 'Documents' }] });
    const context = makeContext(httpRequestWithAuthentication);
    await expect(
      resolveDriveId(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', {
        mode: 'name',
        value: 'Missing',
      }),
    ).rejects.toThrow(/Missing.*not found.*Documents/s);
  });
});

describe('getColumnMap', () => {
  it('fetches columns and builds the map', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({
      value: [{ name: 'Field1', displayName: 'Field 1', text: {} }],
    });
    const context = makeContext(httpRequestWithAuthentication);
    const map = await getColumnMap(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', 'list-1');
    expect(map.byInternalName.get('Field1')?.type).toBe('text');
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/lists/list-1/columns',
    });
  });

  it('rethrows column ambiguity as a NodeOperationError', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({
      value: [
        { name: 'FieldA', displayName: 'Dup', text: {} },
        { name: 'FieldB', displayName: 'Dup', text: {} },
      ],
    });
    const context = makeContext(httpRequestWithAuthentication);
    await expect(
      getColumnMap(context, 'https://graph.microsoft.com/v1.0', { maxRetries: 1 }, 'site-1', 'list-1'),
    ).rejects.toThrow(/Dup.*multiple columns/);
  });
});
