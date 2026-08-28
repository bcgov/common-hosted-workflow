import { describe, expect, it, vi } from 'vitest';
import { deleteItem } from '../../nodes/BcGovSharePoint/actions/item/delete';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('deleteItem', () => {
  it('DELETEs the item and returns { deleted: true }', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue(undefined);
    const context = makeContext(httpRequestWithAuthentication);

    const result = await deleteItem(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-1',
      '42',
    );

    expect(result).toEqual({ deleted: true });
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      method: 'DELETE',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/lists/list-1/items/42',
    });
  });
});
