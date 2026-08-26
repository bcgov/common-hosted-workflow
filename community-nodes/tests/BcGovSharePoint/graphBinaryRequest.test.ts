import { describe, expect, it, vi } from 'vitest';
import { graphBinaryRequest } from '../../nodes/BcGovSharePoint/transport/graphRequest';

function makeContext(requestOAuth2: ReturnType<typeof vi.fn>) {
  return {
    helpers: { requestOAuth2 },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('graphBinaryRequest', () => {
  it('returns the body/headers on the first successful call', async () => {
    const requestOAuth2 = vi
      .fn()
      .mockResolvedValue({ body: Buffer.from('hello'), headers: { 'content-type': 'text/plain' } });
    const context = makeContext(requestOAuth2);

    const result = await graphBinaryRequest(
      context,
      { method: 'GET', url: 'https://graph.example/content' },
      { maxRetries: 3 },
    );

    expect(result.body.toString()).toBe('hello');
    expect(requestOAuth2).toHaveBeenCalledOnce();
    expect(requestOAuth2.mock.calls[0][0]).toBe('bcGovSharePointOAuth2Api');
    expect(requestOAuth2.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      url: 'https://graph.example/content',
      encoding: null,
      resolveWithFullResponse: true,
      json: false,
    });
  });

  it('throws NodeApiError after exhausting retries', async () => {
    const throttled = { statusCode: 429, response: { headers: {} } };
    const requestOAuth2 = vi.fn().mockRejectedValue(throttled);
    const context = makeContext(requestOAuth2);

    await expect(
      graphBinaryRequest(
        context,
        { method: 'GET', url: 'https://graph.example/content' },
        { maxRetries: 1, baseDelayMs: 1 },
      ),
    ).rejects.toThrow();
    expect(requestOAuth2).toHaveBeenCalledTimes(2);
  });
});
