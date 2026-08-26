import { describe, expect, it, vi } from 'vitest';
import { ensureUser } from '../../nodes/BcGovSharePoint/actions/user/ensureUser';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('ensureUser', () => {
  it('returns lookupId from a successful ensureuser response', async () => {
    const httpMock = vi.fn().mockResolvedValue({
      d: { Id: 42, Title: 'Alice Admin', Email: 'alice@gov.bc.ca', LoginName: 'i:0#.f|membership|alice@gov.bc.ca' },
    });
    const context = makeContext(httpMock);

    const result = await ensureUser(
      context,
      { maxRetries: 1 },
      'bcgov.sharepoint.com',
      '/sites/TEST',
      'alice@gov.bc.ca',
    );

    expect(result).toEqual({
      lookupId: 42,
      displayName: 'Alice Admin',
      email: 'alice@gov.bc.ca',
      userName: 'i:0#.f|membership|alice@gov.bc.ca',
    });
    expect(httpMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      url: 'https://bcgov.sharepoint.com/sites/TEST/_api/web/ensureuser',
      body: { logonName: 'alice@gov.bc.ca' },
    });
  });

  it('throws an actionable error when the response is 403', async () => {
    const error403 = { statusCode: 403, message: 'Access denied' };
    const httpMock = vi.fn().mockRejectedValue(error403);
    const context = makeContext(httpMock);

    await expect(
      ensureUser(context, { maxRetries: 1 }, 'bcgov.sharepoint.com', '/sites/TEST', 'bob@gov.bc.ca'),
    ).rejects.toThrow(/Office 365 SharePoint Online/);
  });
});
