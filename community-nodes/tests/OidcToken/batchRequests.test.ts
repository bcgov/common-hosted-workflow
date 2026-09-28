import { describe, expect, it } from 'vitest';
import {
  allRequestUrls,
  createExecutionContext,
  directCreds,
  executeWith,
  passwordCreds,
  requestAt,
  type CreateContextOptions,
} from './helpers';
import { OidcToken } from '../../nodes/OidcToken/OidcToken.node';

const items = [{ json: { scope: 'read:one' } }, { json: { scope: 'write:two' } }];
const tokenResponse = { access_token: 'opaque-token', token_type: 'Bearer' };
const issuer = 'https://login.example.com';
const tokenEndpoint = `${issuer}/token`;

describe('batch requests and item pairing', () => {
  it('evaluates expression scopes at each item and resolves discovery and selections once', async () => {
    const { result, ctx, httpRequest } = await executeWith({
      credentials: directCreds({ oidcIssuer: issuer }),
      items,
      parameterForItem: (name, index) => (name === 'scope' ? items[index].json.scope : undefined),
      httpResponseByUrl: {
        '/.well-known/openid-configuration': { token_endpoint: tokenEndpoint },
        '/token': tokenResponse,
      },
    });
    expect(allRequestUrls(httpRequest)).toEqual([
      `${issuer}/.well-known/openid-configuration`,
      tokenEndpoint,
      tokenEndpoint,
    ]);
    expect((requestAt(httpRequest, 1).body as URLSearchParams).get('scope')).toBe('read:one');
    expect((requestAt(httpRequest, 2).body as URLSearchParams).get('scope')).toBe('write:two');
    expect(result[0]).toEqual(items.map((_, item) => ({ json: tokenResponse, pairedItem: { item } })));
    for (const name of ['grantType', 'processingMode']) {
      expect(ctx.getNodeParameter.mock.calls.filter((call) => call[0] === name)).toEqual([[name, 0]]);
      expect(new OidcToken().description.properties.find((property) => property.name === name)?.noDataExpression).toBe(
        true,
      );
    }
    expect(ctx.getCredentials).toHaveBeenCalledOnce();
  });

  it.each([false, true])('handles scope expression errors with Continue On Fail=%s', async (continueOnFail) => {
    const ctx = createExecutionContext({
      credentials: directCreds(),
      items,
      continueOnFail,
      httpResponse: tokenResponse,
      parameterForItem: (name, index) => {
        if (name !== 'scope') return undefined;
        if (index === 0) throw new Error('Scope expression failed');
        return items[index].json.scope;
      },
    });
    const execution = new OidcToken().execute.call(ctx as never);
    if (continueOnFail) {
      expect(await execution).toEqual([
        [
          { json: { error: 'Scope expression failed' }, pairedItem: { item: 0 } },
          { json: tokenResponse, pairedItem: { item: 1 } },
        ],
      ]);
      expect(ctx.helpers.httpRequest).toHaveBeenCalledOnce();
      expect((requestAt(ctx.helpers.httpRequest, 0).body as URLSearchParams).get('scope')).toBe('write:two');
    } else {
      await expect(execution).rejects.toMatchObject({ name: 'NodeOperationError', message: 'Scope expression failed' });
      expect(ctx.helpers.httpRequest).not.toHaveBeenCalled();
    }
  });

  it.each([false, true])('handles token endpoint errors with Continue On Fail=%s', async (continueOnFail) => {
    const ctx = createExecutionContext({
      credentials: directCreds(),
      items,
      continueOnFail,
      httpResponse: tokenResponse,
    });
    ctx.helpers.httpRequest.mockRejectedValueOnce(
      Object.assign(new Error('Unauthorized'), { response: { status: 401 } }),
    );
    const execution = new OidcToken().execute.call(ctx as never);
    if (continueOnFail) {
      expect(await execution).toEqual([
        [
          { json: { error: 'Unauthorized' }, pairedItem: { item: 0 } },
          { json: tokenResponse, pairedItem: { item: 1 } },
        ],
      ]);
      expect(ctx.helpers.httpRequest).toHaveBeenCalledTimes(2);
    } else {
      await expect(execution).rejects.toMatchObject({ name: 'NodeApiError', message: 'Unauthorized' });
      expect(ctx.helpers.httpRequest).toHaveBeenCalledOnce();
    }
  });
});

describe('execution setup failures', () => {
  const failures: Array<{ name: string; options: CreateContextOptions; error: string; requests: number }> = [
    {
      name: 'invalid credentials',
      options: { credentials: directCreds({ oidcClientId: '' }) },
      error: 'OIDC Client ID is required',
      requests: 0,
    },
    {
      name: 'missing endpoint',
      options: { credentials: directCreds({ oidcTokenEndpoint: '' }) }, // pragma: allowlist secret
      error: 'Either OIDC Issuer or OIDC Token Endpoint must be provided',
      requests: 0,
    },
    {
      name: 'invalid discovery',
      options: { credentials: directCreds({ oidcIssuer: issuer }) }, // pragma: allowlist secret
      error: 'Discovery document did not contain a token_endpoint',
      requests: 1,
    },
    {
      name: 'missing JWKS',
      options: { credentials: directCreds(), params: { processingMode: 'verify' } }, // pragma: allowlist secret
      error: 'no JWKS URI could be resolved',
      requests: 0,
    },
    {
      name: 'discovery missing JWKS',
      options: {
        credentials: directCreds({ oidcIssuer: issuer }),
        params: { processingMode: 'verify' },
        httpResponse: { token_endpoint: tokenEndpoint },
      },
      error: 'no JWKS URI could be resolved',
      requests: 1,
    },
    { name: 'credential retrieval', options: {}, error: 'Credential unavailable', requests: 0 },
    {
      name: 'discovery unavailable',
      options: { credentials: directCreds({ oidcIssuer: issuer }) },
      error: 'Discovery unavailable',
      requests: 1,
    },
    {
      name: 'selection retrieval',
      options: {
        credentials: directCreds(),
        parameterForItem: () => {
          throw new Error('Selection unavailable');
        },
      },
      error: 'Selection unavailable',
      requests: 0,
    },
  ];

  describe.each([false, true])('Continue On Fail=%s', (continueOnFail) => {
    it.each(failures)('$name: no token POST and one setup attempt', async ({ name, options, error, requests }) => {
      const ctx = createExecutionContext({ ...options, items, continueOnFail });
      if (name === 'credential retrieval') ctx.getCredentials.mockRejectedValue(new Error(error));
      if (name === 'discovery unavailable') {
        ctx.helpers.httpRequest.mockRejectedValue(Object.assign(new Error(error), { response: { status: 503 } }));
      }
      const execution = new OidcToken().execute.call(ctx as never);
      if (continueOnFail) {
        const [result] = await execution;
        expect(result).toHaveLength(2);
        result.forEach((entry, item) => {
          expect(entry.pairedItem).toEqual({ item });
          expect(entry.json.error).toContain(error);
        });
      } else {
        await expect(execution).rejects.toMatchObject({
          name: name === 'discovery unavailable' ? 'NodeApiError' : 'NodeOperationError',
          message: expect.stringContaining(error),
        });
      }
      expect(ctx.getCredentials).toHaveBeenCalledOnce();
      expect(ctx.helpers.httpRequest).toHaveBeenCalledTimes(requests);
      expect(ctx.helpers.httpRequest.mock.calls.every(([request]) => request.method === 'GET')).toBe(true);
    });
  });
});

describe('OAuth Basic encoding', () => {
  it.each([
    { id: 'normal-client', secret: 'normal-secret', encoded: 'normal-client:normal-secret' }, // pragma: allowlist secret
    { id: 'client:id+%&=', secret: 'secret:/?@!~', encoded: 'client%3Aid%2B%25%26%3D:secret%3A%2F%3F%40%21%7E' }, // pragma: allowlist secret
    { id: 'client id', secret: ' secret with spaces ', encoded: 'client+id:+secret+with+spaces+' }, // pragma: allowlist secret
    { id: 'café用户', secret: 'clé🔑', encoded: 'caf%C3%A9%E7%94%A8%E6%88%B7:cl%C3%A9%F0%9F%94%91' }, // pragma: allowlist secret
  ])('independently form-encodes $id before Base64, without body duplication', async ({ id, secret, encoded }) => {
    // pragma: allowlist secret
    const { httpRequest } = await executeWith({
      credentials: directCreds({ oidcClientId: id, oidcClientSecret: secret }),
    });
    const request = requestAt(httpRequest, 0);
    expect(request.headers?.Authorization).toBe(`Basic ${Buffer.from(encoded).toString('base64')}`);
    const body = request.body as URLSearchParams;
    expect(body.get('client_id')).toBeNull();
    expect(body.get('client_secret')).toBeNull();
    expect(body.toString()).toBe('grant_type=client_credentials');
  });

  it('keeps public client ID and resource-owner credentials form-encoded in the body', async () => {
    const credentials = passwordCreds({
      oidcClientSecret: '',
      oidcClientId: 'public: café',
      oidcUsername: 'user+name',
      oidcPassword: 'p&ss word', // pragma: allowlist secret
    });
    const { httpRequest } = await executeWith({ credentials, params: { grantType: 'password' } });
    const request = requestAt(httpRequest, 0);
    expect(request.headers?.Authorization).toBeUndefined();
    expect((request.body as URLSearchParams).toString()).toBe(
      'grant_type=password&username=user%2Bname&password=p%26ss+word&client_id=public%3A+caf%C3%A9',
    );
    expect((request.body as URLSearchParams).get('client_secret')).toBeNull();
  });

  it('does not include credential values in configuration errors', async () => {
    const credentials = passwordCreds({
      oidcClientId: 'private: client',
      oidcClientSecret: 'private secret', // pragma: allowlist secret
      oidcUsername: '',
      oidcPassword: 'private password', // pragma: allowlist secret
    });
    const { result, httpRequest } = await executeWith({
      credentials,
      params: { grantType: 'password' },
      items,
      continueOnFail: true,
    });
    for (const item of result[0]) {
      expect(item.json.error).toContain('Resource Owner Username and Password are required');
      for (const value of [credentials.oidcClientId, credentials.oidcClientSecret, credentials.oidcPassword]) {
        expect(item.json.error).not.toContain(value);
      }
    }
    expect(httpRequest).not.toHaveBeenCalled();
  });
});
