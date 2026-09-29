import { describe, expect, it, vi } from 'vitest';
import type { IHttpRequestOptions } from 'n8n-workflow';
import * as crypto from 'node:crypto';
import { includeAuthorizationHeader } from '../../nodes/CHEFS/shared/requestOptions';
import { apiKey, createHarness, formID, localToken } from './helpers';

vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return { ...original, timingSafeEqual: vi.fn(original.timingSafeEqual) };
});

const invalid = [undefined, null, '', ' \t\n ', 123, false, {}, [], ['secret']];

describe('CHEFS local authorization and upstream Basic credentials', () => {
  it.each(['Exact-Token', ' Token With Spaces \t', 'Åuth-🔑', 'e\u0301', 'é'])(
    'accepts exact nonblank UTF-8 tokens (%s)',
    async (token) => {
      const { context } = createHarness({ authorizationToken: token }, { authorizationToken: token });
      const result = await includeAuthorizationHeader.call(context, { url: '/test' });
      expect(result.headers).toEqual({
        authorization: `Basic ${Buffer.from(`${formID}:${apiKey}`).toString('base64')}`,
      });
      expect(Buffer.from(String(result.headers?.authorization).slice(6), 'base64').toString()).toBe(
        `${formID}:${apiKey}`,
      );
    },
  );

  it.each([
    ['Secret', 'secret'],
    ['secret', 'Secret'],
    [' Secret', 'Secret'],
    ['Secret ', 'Secret'],
    ['Secret', '\tSecret'],
    ['a b', 'a  b'],
    ['é', 'e\u0301'],
    ['é', 'aa'],
    ['🔑', 'a'],
  ])('rejects case, whitespace and byte variants (%s / %s)', async (supplied, expected) => {
    const { context } = createHarness({ authorizationToken: supplied }, { authorizationToken: expected });
    const headers = Object.freeze({ authorization: 'existing', Accept: 'application/json' });
    const request = { url: '/test', headers };
    await expect(includeAuthorizationHeader.call(context, request)).rejects.toThrow(
      'Authorization failed: Token mismatch',
    );
    expect(request.headers).toBe(headers);
    expect(request.headers.authorization).toBe('existing');
  });

  for (const field of ['node token', 'credential token', 'API key']) {
    it.each(invalid)(`rejects invalid ${field} (%j) before mutating headers`, async (value) => {
      const { context } = createHarness(
        field === 'node token' ? { authorizationToken: value } : {},
        field === 'credential token' ? { authorizationToken: value } : field === 'API key' ? { apiKey: value } : {},
      );
      const request: IHttpRequestOptions = { url: '/test' };
      await expect(includeAuthorizationHeader.call(context, request)).rejects.toThrow('must be a nonblank string');
      expect(request).toEqual({ url: '/test' });
      const headers = Object.freeze({ Accept: 'application/json', authorization: 'existing' });
      const populatedRequest = { url: '/test', headers };
      const error = await includeAuthorizationHeader.call(context, populatedRequest).catch((error: Error) => error);
      expect(error).toBeInstanceOf(Error);
      expect(populatedRequest.headers).toBe(headers);
      expect(populatedRequest.headers.authorization).toBe('existing');
      expect(JSON.stringify(error)).not.toContain(localToken);
      expect(JSON.stringify(error)).not.toContain(apiKey);
    });
  }

  it('rejects matching whitespace-only tokens', async () => {
    const { context } = createHarness({ authorizationToken: '   ' }, { authorizationToken: '   ' });
    await expect(includeAuthorizationHeader.call(context, { url: '/test' })).rejects.toThrow(
      'Node Authorization Token',
    );
  });

  it('uses timing-safe comparison only with equal byte lengths', async () => {
    const compare = vi.mocked(crypto.timingSafeEqual);
    const { context } = createHarness({ authorizationToken: 'é' }, { authorizationToken: 'aa' });
    await expect(includeAuthorizationHeader.call(context, { url: '/test' })).rejects.toThrow('Token mismatch');
    expect(compare).toHaveBeenCalledExactlyOnceWith(Buffer.from('é'), Buffer.from('aa'));
    compare.mockClear();
    const unequal = createHarness({ authorizationToken: '🔑' }, { authorizationToken: 'a' });
    await expect(includeAuthorizationHeader.call(unequal.context, { url: '/test' })).rejects.toThrow('Token mismatch');
    expect(compare).not.toHaveBeenCalled();
  });

  it('preserves upstream key bytes and existing unrelated headers', async () => {
    const key = ' Key:with spaces/Ä+🔑 ';
    const { context } = createHarness({}, { apiKey: key });
    const request = {
      url: '/test',
      headers: { Accept: 'application/json', 'x-request-id': 'trace', authorization: 'old' },
    };
    const result = await includeAuthorizationHeader.call(context, request);
    expect(result).toBe(request);
    expect(result.headers).toEqual({
      Accept: 'application/json',
      'x-request-id': 'trace',
      authorization: `Basic ${Buffer.from(`${formID}:${key}`).toString('base64')}`,
    });
  });

  it('does not leak either local token or the upstream key in mismatch errors', async () => {
    const supplied = 'Different-Input-SECRET';
    const { context } = createHarness({ authorizationToken: supplied });
    const error = await includeAuthorizationHeader.call(context, { url: '/test' }).catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    const serialized = JSON.stringify(error);
    for (const secret of [supplied, localToken, apiKey, Buffer.from(`${formID}:${apiKey}`).toString('base64')]) {
      expect(serialized).not.toContain(secret);
      expect(String(error)).not.toContain(secret);
    }
  });

  it('does not stringify invalid credential values into errors', async () => {
    const poison = {
      toString: () => {
        throw new Error('SECRET must not be stringified');
      },
    };
    const { context } = createHarness({}, { apiKey: poison });
    await expect(includeAuthorizationHeader.call(context, { url: '/test' })).rejects.toThrow(
      'Credential API Key must be a nonblank string',
    );
  });

  it('leaves existing headers intact when credential retrieval fails', async () => {
    const { context, getCredentials } = createHarness();
    getCredentials.mockRejectedValueOnce(new Error('Credential retrieval failed'));
    const request = { url: '/test', headers: Object.freeze({ authorization: 'existing' }) };
    await expect(includeAuthorizationHeader.call(context, request)).rejects.toThrow('Credential retrieval failed');
    expect(request.headers).toEqual({ authorization: 'existing' });
  });
});
