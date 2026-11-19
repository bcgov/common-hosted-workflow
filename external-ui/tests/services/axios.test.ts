import { afterEach, describe, expect, it } from 'vitest';
import { instance } from '@/services/backend/axios';
import { getRateLimitTimezone, setRateLimitTimezone } from '@/lib/rate-limit';

describe('API period timezone synchronization', () => {
  afterEach(() => setRateLimitTimezone('America/Vancouver'));

  it('sets the enforcement timezone before resolving response data', async () => {
    await instance.get('/ui-api/projects', {
      adapter: async (config) => ({
        config,
        status: 200,
        statusText: 'OK',
        data: { data: [] },
        headers: { 'x-rate-limit-timezone': 'Pacific/Kiritimati' },
      }),
    });
    expect(getRateLimitTimezone()).toBe('Pacific/Kiritimati');
  });
});
