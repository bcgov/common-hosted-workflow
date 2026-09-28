import { createSign, generateKeyPairSync } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allRequestUrls, createExecutionContext, directCreds, executeWith } from './helpers';
import { createJwksResolver, verifyJwt, type VerifyOptions } from '../../nodes/OidcToken/shared/GenericFunctions';
import { OidcToken } from '../../nodes/OidcToken/OidcToken.node';

const NOW = 1_800_000_000;
const JWKS_URI = 'https://login.example.com/certs';
const firstPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rotatedPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...firstPair.publicKey.export({ format: 'jwk' }), kid: 'first', alg: 'RS256', use: 'sig' };
const rotatedJwk = { ...rotatedPair.publicKey.export({ format: 'jwk' }), kid: 'rotated', alg: 'RS256', use: 'sig' };

function signToken(
  payload: Record<string, unknown> | string = { exp: NOW + 100 },
  header: Record<string, unknown> = { alg: 'RS256', kid: 'first' },
  privateKey = firstPair.privateKey,
) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)).toString(
    'base64url',
  );
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign('RSA-SHA256').update(data).sign(privateKey, 'base64url');
  return `${data}.${signature}`;
}

function verify(payload: Record<string, unknown> | string, clockTolerance?: unknown) {
  const ctx = createExecutionContext({ httpResponse: { keys: [jwk] } });
  return verifyJwt(ctx as never, signToken(payload), { jwksUri: JWKS_URI, clockTolerance } as VerifyOptions);
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
});
afterEach(() => vi.restoreAllMocks());

describe('signed JWT temporal validation at a frozen clock', () => {
  it.each([
    { exp: NOW + 1, tolerance: 0 },
    { exp: NOW, tolerance: 1 },
    { exp: NOW - 9, tolerance: 10 },
    { exp: NOW + 0.5, tolerance: 0 },
    { exp: NOW, tolerance: 0.5 },
  ])('accepts before the expiry boundary: %j', async ({ exp, tolerance }) => {
    await expect(verify({ exp }, tolerance)).resolves.toMatchObject({ payload: { exp } });
  });

  it.each([
    { exp: NOW, tolerance: 0 },
    { exp: NOW - 1, tolerance: 0 },
    { exp: NOW - 10, tolerance: 10 },
    { exp: NOW - 11, tolerance: 10 },
    { exp: NOW - 0.5, tolerance: 0.5 },
  ])('rejects at/after the expiry boundary: %j', async ({ exp, tolerance }) => {
    await expect(verify({ exp }, tolerance)).rejects.toThrow('JWT has expired');
  });

  describe.each(['nbf', 'iat'])('%s policy', (claim) => {
    it.each([-1, 0, 10])('accepts a claim offset of %s within tolerance', async (offset) => {
      const payload = { exp: NOW + 100, [claim]: NOW + offset };
      await expect(verify(payload, offset > 0 ? 10 : 0)).resolves.toMatchObject({ payload });
    });

    it.each([
      { offset: 1, tolerance: 0 },
      { offset: 11, tolerance: 10 },
    ])('rejects future claims beyond tolerance: %j', async ({ offset, tolerance }) => {
      await expect(verify({ exp: NOW + 100, [claim]: NOW + offset }, tolerance)).rejects.toThrow(claim);
    });
  });

  describe.each(['exp', 'nbf', 'iat'])('malformed %s', (claim) => {
    it.each(['"1800000100"', 'null', 'true', '[]', '{}', '1e400', '-1e400'])(
      'rejects signed nonnumeric/nonfinite JSON %s',
      async (raw) => {
        // 1e400 parses to Infinity; unlike JSON.stringify(Infinity), it is not null.
        const payload = claim === 'exp' ? `{"exp":${raw}}` : `{"exp":${NOW + 100},"${claim}":${raw}}`;
        await expect(verify(payload)).rejects.toThrow(new RegExp(`"${claim}".*finite|finite.*"${claim}"`));
      },
    );
  });

  it('requires exp but permits absent nbf and iat', async () => {
    await expect(verify({})).rejects.toThrow('"exp"');
    await expect(verify({ exp: NOW + 100 })).resolves.toMatchObject({ payload: { exp: NOW + 100 } });
  });

  it.each([-1, NaN, Infinity, -Infinity, '0', null, true])(
    'rejects invalid tolerance %s before JWKS I/O',
    async (value) => {
      const ctx = createExecutionContext({ httpResponse: { keys: [jwk] } });
      await expect(
        verifyJwt(ctx as never, signToken(), {
          jwksUri: JWKS_URI,
          clockTolerance: value,
        } as VerifyOptions),
      ).rejects.toThrow('Clock Tolerance must be a finite nonnegative number');
      expect(ctx.helpers.httpRequest).not.toHaveBeenCalled();
    },
  );
});

describe('execution-local JWKS reuse and strict key selection', () => {
  const items = Array.from({ length: 4 }, () => ({ json: {} }));

  it('uses one JWKS request for N signed items and fetches anew in the next execution', async () => {
    const ctx = createExecutionContext({
      credentials: directCreds({ oidcJwksUri: JWKS_URI }),
      items,
      params: { processingMode: 'verify' },
      httpResponseByUrl: { '/token': { access_token: signToken() }, [JWKS_URI]: { keys: [jwk] } },
    });
    const node = new OidcToken();
    for (let execution = 1; execution <= 2; execution++) {
      const [result] = await node.execute.call(ctx as never);
      expect(result).toHaveLength(items.length);
      result.forEach((item, index) => {
        expect(item.pairedItem).toEqual({ item: index });
        expect(item.json.tokenClaims).toEqual({ exp: NOW + 100 });
      });
      expect(allRequestUrls(ctx.helpers.httpRequest).filter((url) => url === JWKS_URI)).toHaveLength(execution);
      expect(allRequestUrls(ctx.helpers.httpRequest).filter((url) => url.endsWith('/token'))).toHaveLength(
        4 * execution,
      );
    }
  });

  it('recovers from an item-specific temporal failure and evaluates verification options for each item', async () => {
    const token = signToken({ exp: NOW, nbf: NOW + 1, iat: NOW + 1, iss: 'issuer', aud: ['api'] });
    const { result, ctx, httpRequest } = await executeWith({
      credentials: directCreds({ oidcJwksUri: JWKS_URI }),
      items: items.slice(0, 2),
      params: { processingMode: 'verify', expectedIssuer: 'issuer', expectedAudience: 'api' },
      parameterForItem: (name, index) => (name === 'clockTolerance' ? index : undefined),
      httpResponseByUrl: { '/token': { access_token: token }, [JWKS_URI]: { keys: [jwk] } },
      continueOnFail: true,
    });
    expect(result[0][0]).toMatchObject({
      json: { error: expect.stringContaining('JWT has expired') },
      pairedItem: { item: 0 },
    });
    expect(result[0][1]).toMatchObject({
      json: { tokenClaims: { exp: NOW, nbf: NOW + 1, iat: NOW + 1 } },
      pairedItem: { item: 1 },
    });
    for (const name of ['clockTolerance', 'expectedIssuer', 'expectedAudience']) {
      expect(ctx.getNodeParameter.mock.calls.filter((call) => call[0] === name).map((call) => call[1])).toEqual([0, 1]);
    }
    expect(allRequestUrls(httpRequest).filter((url) => url === JWKS_URI)).toHaveLength(1);
    expect(httpRequest).toHaveBeenCalledTimes(3);
  });

  it('refreshes once for rotation, then fails every still-unknown kid without further requests', async () => {
    const tokens = [
      signToken(),
      signToken(undefined, { alg: 'RS256', kid: 'rotated' }, rotatedPair.privateKey),
      signToken(undefined, { alg: 'RS256', kid: 'unknown' }),
      signToken(undefined, { alg: 'RS256', kid: 'other' }),
    ];
    const { result, httpRequest } = await executeWith({
      credentials: directCreds({ oidcJwksUri: JWKS_URI }),
      items,
      params: { processingMode: 'verify' },
      continueOnFail: true,
      httpResponses: [
        { access_token: tokens[0] },
        { keys: [jwk] },
        { access_token: tokens[1] },
        { keys: [jwk, rotatedJwk] },
        { access_token: tokens[2] },
        { access_token: tokens[3] },
      ],
    });
    expect(result[0].map((item) => item.pairedItem)).toEqual(items.map((_, item) => ({ item })));
    expect(result[0][0].json.tokenClaims).toEqual({ exp: NOW + 100 });
    expect(result[0][1].json.tokenClaims).toEqual({ exp: NOW + 100 });
    expect(result[0][2].json.error).toContain('kid "unknown"');
    expect(result[0][3].json.error).toContain('kid "other"');
    expect(allRequestUrls(httpRequest).filter((url) => url === JWKS_URI)).toHaveLength(2);
    expect(httpRequest).toHaveBeenCalledTimes(6);
  });

  it('bounds refresh even if the first token has an unknown kid', async () => {
    const ctx = createExecutionContext({ httpResponse: { keys: [jwk] } });
    const resolve = createJwksResolver(ctx as never, JWKS_URI);
    for (const kid of ['unknown', 'other', 'unknown']) {
      await expect(resolve({ kid })).rejects.toThrow(`kid "${kid}"`);
    }
    expect(ctx.helpers.httpRequest).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('retains a failed JWKS request (refresh=%s)', async (refresh) => {
    const ctx = createExecutionContext({});
    if (refresh) ctx.helpers.httpRequest.mockResolvedValueOnce({ keys: [jwk] });
    ctx.helpers.httpRequest.mockRejectedValue(new Error('JWKS unavailable'));
    const resolve = createJwksResolver(ctx as never, JWKS_URI);
    for (let i = 0; i < 3; i++) {
      await expect(resolve({ kid: 'unknown' })).rejects.toThrow('JWKS unavailable');
    }
    expect(ctx.helpers.httpRequest).toHaveBeenCalledTimes(refresh ? 2 : 1);
  });

  it.each([{}, { keys: [] }, { keys: 'invalid' }, null])(
    'rejects malformed/empty JWKS without refresh: %j',
    async (response) => {
      const ctx = createExecutionContext({ httpResponse: response });
      const resolve = createJwksResolver(ctx as never, JWKS_URI);
      await expect(resolve({ kid: 'first' })).rejects.toThrow('JWKS response did not contain any keys');
      expect(ctx.helpers.httpRequest).toHaveBeenCalledOnce();
    },
  );

  it.each([undefined, 'none', 'HS256', 'unknown'])(
    'rejects unsupported/missing alg %s without JWK fallback',
    async (alg) => {
      const ctx = createExecutionContext({ httpResponse: { keys: [jwk] } });
      await expect(
        verifyJwt(ctx as never, signToken(undefined, { alg, kid: 'first' }), {
          jwksUri: JWKS_URI,
        }),
      ).rejects.toThrow(alg ? 'Unsupported JWT algorithm' : 'missing the "alg"');
      expect(ctx.helpers.httpRequest).not.toHaveBeenCalled();
    },
  );

  it('rejects an ambiguous key set without kid and accepts a single signing key', async () => {
    const token = signToken(undefined, { alg: 'RS256' });
    const ctx = createExecutionContext({ httpResponse: { keys: [jwk, rotatedJwk] } });
    await expect(verifyJwt(ctx as never, token, { jwksUri: JWKS_URI })).rejects.toThrow('multiple signing keys');
    expect(ctx.helpers.httpRequest).toHaveBeenCalledOnce();
    ctx.helpers.httpRequest.mockResolvedValue({ keys: [jwk] });
    await expect(verifyJwt(ctx as never, token, { jwksUri: JWKS_URI })).resolves.toHaveProperty('payload');
  });

  it.each([
    { key: { ...jwk, kty: 'EC' }, error: 'requires an RSA key' },
    { key: { ...jwk, use: 'enc' }, error: 'does not contain a key with kid' },
    { key: { ...rotatedJwk, kid: 'first' }, error: 'signature verification failed' },
  ])('rejects incompatible, non-signing, or incorrect keys without refresh: $error', async ({ key, error }) => {
    const ctx = createExecutionContext({ httpResponse: { keys: [key] } });
    const resolve = createJwksResolver(ctx as never, JWKS_URI);
    await expect(verifyJwt(ctx as never, signToken(), { jwksUri: JWKS_URI }, resolve)).rejects.toThrow(error);
    expect(ctx.helpers.httpRequest).toHaveBeenCalledOnce();
  });
});
