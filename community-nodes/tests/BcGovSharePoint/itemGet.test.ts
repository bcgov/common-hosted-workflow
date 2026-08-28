import { describe, expect, it, vi } from 'vitest';
import { getItem } from '../../nodes/BcGovSharePoint/actions/item/get';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('getItem', () => {
  it('GETs the item with fields expanded', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: '42', fields: { Title: 'Referral A' } });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await getItem(
      context,
      'https://graph.microsoft.com/v1.0',
      { maxRetries: 1 },
      'site-1',
      'list-1',
      '42',
    );

    expect(result).toEqual({ id: '42', fields: { Title: 'Referral A' } });
    expect(httpRequestWithAuthentication.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      url: 'https://graph.microsoft.com/v1.0/sites/site-1/lists/list-1/items/42',
      qs: { $expand: 'fields' },
    });
  });
});
