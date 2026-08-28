import { describe, expect, it, vi } from 'vitest';
import { graphRequest, GRAPH_CREDENTIAL_TYPE } from '../../nodes/BcGovSharePoint/transport/graphRequest';

function makeContext(httpRequestWithAuthentication: ReturnType<typeof vi.fn>) {
  return {
    helpers: { httpRequestWithAuthentication },
    getNode: () => ({ name: 'BC Gov SharePoint' }),
  };
}

describe('graphRequest', () => {
  it('returns the response on the first successful call', async () => {
    const httpRequestWithAuthentication = vi.fn().mockResolvedValue({ id: 'site-1' });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await graphRequest(
      context,
      { method: 'GET', url: 'https://graph.example/sites/1' },
      { maxRetries: 3 },
    );

    expect(result).toEqual({ id: 'site-1' });
    expect(httpRequestWithAuthentication).toHaveBeenCalledOnce();
    expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
      GRAPH_CREDENTIAL_TYPE,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('retries on a 429 and succeeds on the next attempt', async () => {
    const throttled = { statusCode: 429, response: { headers: {} } };
    const httpRequestWithAuthentication = vi
      .fn()
      .mockRejectedValueOnce(throttled)
      .mockResolvedValueOnce({ id: 'site-1' });
    const context = makeContext(httpRequestWithAuthentication);

    const result = await graphRequest(
      context,
      { method: 'GET', url: 'https://graph.example/sites/1' },
      { maxRetries: 3, baseDelayMs: 1 },
    );

    expect(result).toEqual({ id: 'site-1' });
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
  });

  it('honours Retry-After when present', async () => {
    vi.useFakeTimers();
    const throttled = { statusCode: 429, response: { headers: { 'retry-after': '2' } } };
    const httpRequestWithAuthentication = vi
      .fn()
      .mockRejectedValueOnce(throttled)
      .mockResolvedValueOnce({ id: 'site-1' });
    const context = makeContext(httpRequestWithAuthentication);

    const promise = graphRequest(
      context,
      { method: 'GET', url: 'https://graph.example/sites/1' },
      { maxRetries: 3, baseDelayMs: 1 },
    );

    await vi.advanceTimersByTimeAsync(2100);
    const result = await promise;

    expect(result).toEqual({ id: 'site-1' });
    vi.useRealTimers();
  });

  it('throws NodeApiError after exhausting retries', async () => {
    const throttled = { statusCode: 429, response: { headers: {} } };
    const httpRequestWithAuthentication = vi.fn().mockRejectedValue(throttled);
    const context = makeContext(httpRequestWithAuthentication);

    await expect(
      graphRequest(context, { method: 'GET', url: 'https://graph.example/sites/1' }, { maxRetries: 1, baseDelayMs: 1 }),
    ).rejects.toThrow();
    expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a non-retryable status (e.g. 403)', async () => {
    const forbidden = { statusCode: 403, response: { headers: {} } };
    const httpRequestWithAuthentication = vi.fn().mockRejectedValue(forbidden);
    const context = makeContext(httpRequestWithAuthentication);

    await expect(
      graphRequest(context, { method: 'GET', url: 'https://graph.example/sites/1' }, { maxRetries: 3, baseDelayMs: 1 }),
    ).rejects.toThrow();
    expect(httpRequestWithAuthentication).toHaveBeenCalledOnce();
  });
});
