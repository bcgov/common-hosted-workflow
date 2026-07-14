import { describe, expect, it } from 'vitest';
import { createPublicKey, createSign, generateKeyPairSync } from 'crypto';
import {
  allRequestUrls,
  cloneCreds,
  createExecutionContext,
  directCreds,
  executeWith,
  passwordCreds,
  requestAt,
  type TestExecutionContext,
} from './helpers';

const ISSUER = 'https://login.example.com/realms/test';
const TOKEN_ENDPOINT = `${ISSUER}/protocol/openid-connect/token`;
const JWKS_URI = `${ISSUER}/protocol/openid-connect/certs`;
const DISCOVERY_URL = '/.well-known/openid-configuration';

function makeDiscoveryResponse() {
  return { token_endpoint: TOKEN_ENDPOINT, jwks_uri: JWKS_URI, issuer: ISSUER };
}

function makeTokenResponse(accessToken: string) {
  return { access_token: accessToken, token_type: 'Bearer', expires_in: 300, scope: '' };
}

function buildRsaJwk(publicKeyPem: string, kid = 'test-kid') {
  const keyObject = createPublicKey(publicKeyPem);
  const jwk = keyObject.export({ format: 'jwk' }) as Record<string, string>;
  return { ...jwk, kid, alg: 'RS256', use: 'sig' };
}

function signRs256(parts: string, privateKeyPem: string): string {
  const signer = createSign('RSA-SHA256');
  signer.update(parts, 'utf8');
  return signer.sign(privateKeyPem, 'base64url');
}

function makeJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKeyPem: string): string {
  const hB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const pB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signed = `${hB64}.${pB64}`;
  const sig = signRs256(signed, privateKeyPem);
  return `${signed}.${sig}`;
}

describe('OidcToken node', () => {
  describe('credential validation', () => {
    it('throws when neither issuer nor token endpoint is provided', async () => {
      await expect(
        executeWith({
          credentials: cloneCreds({ oidcIssuer: '', oidcTokenEndpoint: '' }),
          httpResponse: {},
        }),
      ).rejects.toThrow('Either OIDC Issuer or OIDC Token Endpoint must be provided');
    });

    it('throws when client id is missing', async () => {
      await expect(
        executeWith({
          credentials: directCreds({ oidcClientId: '' }),
          httpResponse: {},
        }),
      ).rejects.toThrow('OIDC Client ID is required');
    });

    it('throws when client secret is missing on the Client Credentials grant', async () => {
      await expect(
        executeWith({
          credentials: directCreds({ oidcClientSecret: '' }),
          httpResponse: {},
        }),
      ).rejects.toThrow('OIDC Client Secret is required for the Client Credentials grant');
    });

    it('throws when username is missing on the Password grant', async () => {
      await expect(
        executeWith({
          credentials: directCreds({ oidcUsername: '', oidcPassword: 'pw' }),
          params: { grantType: 'password' },
          httpResponse: {},
        }),
      ).rejects.toThrow('Resource Owner Username and Password are required');
    });

    it('allows an empty client secret on the Password grant (public client)', async () => {
      const { httpRequest } = await executeWith({
        credentials: passwordCreds({ oidcClientSecret: '' }),
        params: { grantType: 'password' },
        httpResponse: makeTokenResponse('aaa.bbb.ccc'),
      });
      // No Authorization header; client_id sent in the body instead
      expect(requestAt(httpRequest, 0).headers?.Authorization).toBeUndefined();
      expect((requestAt(httpRequest, 0).body as URLSearchParams).get('client_id')).toBe('test-client');
    });
  });

  describe('Token Processing Mode: None', () => {
    it('uses the explicit token endpoint when issuer is empty and returns the raw token response', async () => {
      const tokenResponse = makeTokenResponse('abc.def.ghi');
      const { result, httpRequest } = await executeWith({
        credentials: directCreds(),
        httpResponse: tokenResponse,
      });

      expect(httpRequest).toHaveBeenCalledOnce();
      const req = requestAt(httpRequest, 0);
      expect(req.method).toBe('POST');
      expect(req.url).toBe(TOKEN_ENDPOINT);
      expect(req.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(req.headers?.Authorization).toMatch(/^Basic /);
      expect(req.body).toBeInstanceOf(URLSearchParams);
      expect((req.body as URLSearchParams).get('grant_type')).toBe('client_credentials');

      expect(result[0][0].json).toEqual(tokenResponse);
      expect(result[0][0].json).not.toHaveProperty('tokenClaims');
    });

    it('includes the scope in the form body when provided', async () => {
      const { httpRequest } = await executeWith({
        credentials: directCreds(),
        params: { scope: 'openid profile' },
        httpResponse: makeTokenResponse('aaa.bbb.ccc'),
      });
      expect((requestAt(httpRequest, 0).body as URLSearchParams).get('scope')).toBe('openid profile');
    });
  });

  describe('Discovery flow', () => {
    it('auto-discovers the token endpoint from the issuer well-known document', async () => {
      const discovery = makeDiscoveryResponse();
      const { result, httpRequest } = await executeWith({
        credentials: cloneCreds({ oidcIssuer: ISSUER, oidcTokenEndpoint: '' }),
        httpResponseByUrl: {
          [DISCOVERY_URL]: discovery,
          '/token': makeTokenResponse('aaa.bbb.ccc'),
        },
      });

      const urls = allRequestUrls(httpRequest);
      expect(urls[0]).toContain('/.well-known/openid-configuration');
      expect(urls[1]).toBe(TOKEN_ENDPOINT);
      expect(result[0][0].json).toHaveProperty('access_token', 'aaa.bbb.ccc');
    });

    it('throws when the discovery document lacks a token_endpoint', async () => {
      await expect(
        executeWith({
          credentials: cloneCreds({ oidcIssuer: ISSUER, oidcTokenEndpoint: '' }),
          httpResponseByUrl: { [DISCOVERY_URL]: { jwks_uri: JWKS_URI } },
        }),
      ).rejects.toThrow('Discovery document did not contain a token_endpoint');
    });
  });

  describe('Token Processing Mode: Decode', () => {
    it('appends tokenClaims and decodedToken to the response without verifying the signature', async () => {
      const header = { alg: 'RS256', typ: 'JWT', kid: 'test-kid' };
      const payload = { iss: ISSUER, sub: 'client-1', exp: 9999999999, iat: 1, aud: 'account' };
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      const token = makeJwt(header, payload, privateKeyPem);

      const { result, httpRequest } = await executeWith({
        credentials: directCreds(),
        params: { processingMode: 'decode' },
        httpResponseByUrl: { '/token': makeTokenResponse(token) },
      });

      expect(httpRequest).toHaveBeenCalledOnce();
      expect(result[0][0].json.tokenClaims).toMatchObject({
        iss: ISSUER,
        sub: 'client-1',
        exp: 9999999999,
      });
      expect(result[0][0].json.decodedToken).toMatchObject({
        header,
        payload,
      });
    });

    it('errors when the token response has no access_token to decode', async () => {
      await expect(
        executeWith({
          credentials: directCreds(),
          params: { processingMode: 'decode' },
          httpResponseByUrl: { '/token': { token_type: 'Bearer' } },
        }),
      ).rejects.toThrow('did not contain an access_token to decode');
    });

    it('decodes even a malformed 2-segment token by throwing a clear error', async () => {
      await expect(
        executeWith({
          credentials: directCreds(),
          params: { processingMode: 'decode' },
          httpResponseByUrl: { '/token': makeTokenResponse('not-a-jwt') },
        }),
      ).rejects.toThrow('Invalid JWT');
    });
  });

  describe('Token Processing Mode: Verify', () => {
    it('verifies an RS256 JWT signature against JWKS and enriches the payload', async () => {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      const jwk = buildRsaJwk(publicKeyPem, 'test-kid');

      const header = { alg: 'RS256', typ: 'JWT', kid: 'test-kid' };
      const payload = {
        iss: ISSUER,
        sub: 'client-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        aud: 'account',
      };
      const token = makeJwt(header, payload, privateKeyPem);

      const { result, httpRequest } = await executeWith({
        credentials: directCreds({ oidcJwksUri: JWKS_URI }),
        params: {
          processingMode: 'verify',
          expectedIssuer: ISSUER,
          expectedAudience: 'account',
        },
        httpResponseByUrl: {
          '/token': makeTokenResponse(token),
          [JWKS_URI]: { keys: [jwk] },
        },
      });

      const urls = allRequestUrls(httpRequest);
      expect(urls[0]).toBe(TOKEN_ENDPOINT);
      expect(urls[1]).toBe(JWKS_URI);
      expect(result[0][0].json.tokenClaims).toMatchObject({ sub: 'client-1' });
      expect(result[0][0].json.decodedToken.payload).toMatchObject(payload);
    });

    it('rejects an expired JWT', async () => {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      const jwk = buildRsaJwk(publicKeyPem, 'test-kid');

      const payload = { iss: ISSUER, sub: 'x', exp: 1000, iat: 1, aud: 'account' };
      const token = makeJwt({ alg: 'RS256', typ: 'JWT', kid: 'test-kid' }, payload, privateKeyPem);

      await expect(
        executeWith({
          credentials: directCreds({ oidcJwksUri: JWKS_URI }),
          params: { processingMode: 'verify' },
          httpResponseByUrl: {
            '/token': makeTokenResponse(token),
            [JWKS_URI]: { keys: [jwk] },
          },
        }),
      ).rejects.toThrow('JWT has expired');
    });

    it('rejects a tampered JWT signature', async () => {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      const jwk = buildRsaJwk(publicKeyPem, 'test-kid');

      const payload = { iss: ISSUER, sub: 'x', exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = makeJwt({ alg: 'RS256', typ: 'JWT', kid: 'test-kid' }, payload, privateKeyPem);
      const tampered = `${token.slice(0, -4)}AAAA`;

      await expect(
        executeWith({
          credentials: directCreds({ oidcJwksUri: JWKS_URI }),
          params: { processingMode: 'verify' },
          httpResponseByUrl: {
            '/token': makeTokenResponse(tampered),
            [JWKS_URI]: { keys: [jwk] },
          },
        }),
      ).rejects.toThrow('JWT signature verification failed');
    });

    it('validates expectedIssuer and expectedAudience claims', async () => {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      const jwk = buildRsaJwk(publicKeyPem, 'test-kid');

      const payload = {
        iss: 'https://other.example.com',
        sub: 'x',
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: 'something-else',
      };
      const token = makeJwt({ alg: 'RS256', typ: 'JWT', kid: 'test-kid' }, payload, privateKeyPem);

      await expect(
        executeWith({
          credentials: directCreds({ oidcJwksUri: JWKS_URI }),
          params: {
            processingMode: 'verify',
            expectedIssuer: ISSUER,
          },
          httpResponseByUrl: {
            '/token': makeTokenResponse(token),
            [JWKS_URI]: { keys: [jwk] },
          },
        }),
      ).rejects.toThrow('JWT issuer mismatch');
    });

    it('errors when no JWKS URI could be resolved', async () => {
      await expect(
        executeWith({
          credentials: directCreds({ oidcJwksUri: '' }),
          params: { processingMode: 'verify' },
          httpResponseByUrl: { '/token': makeTokenResponse('aaa.bbb.ccc') },
        }),
      ).rejects.toThrow('no JWKS URI could be resolved');
    });
  });

  describe('error handling', () => {
    it('returns error json when continueOnFail is true and the token response has no access_token', async () => {
      const { result, httpRequest } = await executeWith({
        credentials: directCreds(),
        params: { processingMode: 'decode' },
        httpResponseByUrl: { '/token': { token_type: 'Bearer' } },
        continueOnFail: true,
      });
      expect(httpRequest).toHaveBeenCalledOnce();
      expect(result[0][0].json).toHaveProperty('error');
      expect(result[0][0].json.error).toMatch(/did not contain an access_token/);
      expect(result[0][0].pairedItem).toEqual({ item: 0 });
    });

    it('throws NodeApiError when the token endpoint rejects with an HTTP response', async () => {
      const { OidcToken } = await import('../../nodes/OidcToken/OidcToken.node');
      const node = new OidcToken();
      const ctx = createExecutionContext({
        credentials: directCreds(),
        httpResponse: undefined,
      }) as TestExecutionContext;
      const apiError = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
      ctx.helpers.httpRequest.mockRejectedValueOnce(apiError);

      await expect(node.execute.call(ctx as never)).rejects.toThrow('Unauthorized');
    });
  });

  describe('Grant Type: Password', () => {
    it('sends grant_type=password with username and password from the credential in the form body', async () => {
      const { httpRequest } = await executeWith({
        credentials: passwordCreds(),
        params: { grantType: 'password' },
        httpResponse: makeTokenResponse('aaa.bbb.ccc'),
      });

      const body = requestAt(httpRequest, 0).body as URLSearchParams;
      expect(body.get('grant_type')).toBe('password');
      expect(body.get('username')).toBe('alice@example.com');
      expect(body.get('password')).toBe('s3cret-pw');
      // client credentials go via Basic auth, not the body
      expect(requestAt(httpRequest, 0).headers?.Authorization).toMatch(/^Basic /);
      expect(body.get('client_id')).toBeNull();
      expect(body.get('client_secret')).toBeNull();
    });

    it('still applies scope on the password grant', async () => {
      const { httpRequest } = await executeWith({
        credentials: passwordCreds(),
        params: { grantType: 'password', scope: 'openid email' },
        httpResponse: makeTokenResponse('aaa.bbb.ccc'),
      });
      expect((requestAt(httpRequest, 0).body as URLSearchParams).get('scope')).toBe('openid email');
    });

    it('throws when username/password are missing in the credential', async () => {
      await expect(
        executeWith({
          credentials: directCreds({ oidcUsername: '', oidcPassword: '' }),
          params: { grantType: 'password' },
          httpResponse: makeTokenResponse('aaa.bbb.ccc'),
        }),
      ).rejects.toThrow('Resource Owner Username and Password are required');
    });

    it('defaults to client_credentials when grantType is omitted (back-compat)', async () => {
      const { httpRequest } = await executeWith({
        credentials: directCreds(),
        httpResponse: makeTokenResponse('aaa.bbb.ccc'),
      });
      expect((requestAt(httpRequest, 0).body as URLSearchParams).get('grant_type')).toBe('client_credentials');
      expect((requestAt(httpRequest, 0).body as URLSearchParams).get('username')).toBeNull();
    });
  });
});
