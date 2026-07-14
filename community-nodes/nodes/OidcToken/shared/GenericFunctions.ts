import { constants as cryptoConstants, createPublicKey, createVerify, type KeyObject } from 'crypto';
import type { IExecuteFunctions, IDataObject, IHttpRequestOptions } from 'n8n-workflow';

export interface OidcCredentials {
  oidcIssuer: string;
  oidcTokenEndpoint: string;
  oidcJwksUri: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcUsername: string;
  oidcPassword: string;
}

export interface DiscoveryDocument {
  token_endpoint?: string;
  jwks_uri?: string;
  issuer?: string;
}

export interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  crv?: string;
  [key: string]: unknown;
}

export interface JwksResponse {
  keys: Jwk[];
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

export interface VerifyOptions {
  jwksUri: string;
  /** Allow clock skew in seconds when validating `exp` and `iat`. */
  clockTolerance?: number;
  /** Expected `iss` claim, validated when set. */
  expectedIssuer?: string;
  /** Expected `aud` claim, validated when set. */
  expectedAudience?: string;
}

const algToCryptoAlg: Record<string, string> = {
  RS256: 'RSA-SHA256',
  RS384: 'RSA-SHA384',
  RS512: 'RSA-SHA512',
  ES256: 'SHA256',
  ES384: 'SHA384',
  ES512: 'SHA512',
  PS256: 'RSA-SHA256',
  PS384: 'RSA-SHA384',
  PS512: 'RSA-SHA512',
};

/**
 * Fetch the contents of <issuer>/.well-known/openid-configuration.
 */
export async function fetchDiscoveryDocument(ctx: IExecuteFunctions, issuerUrl: string): Promise<DiscoveryDocument> {
  const baseUrl = issuerUrl.replace(/\/+$/, '');
  const options: IHttpRequestOptions = {
    method: 'GET',
    url: `${baseUrl}/.well-known/openid-configuration`,
    headers: { Accept: 'application/json' },
    json: true,
  };
  return ctx.helpers.httpRequest(options) as Promise<DiscoveryDocument>;
}

/**
 * Validate the OIDC credentials against the requirements of the selected grant type:
 *
 *  - Either `oidcIssuer` or `oidcTokenEndpoint` must always be provided.
 *  - `oidcClientId` is always required.
 *  - Client Credentials grant: `oidcClientSecret` is required.
 *  - Password grant: `oidcUsername` and `oidcPassword` are required.
 *    `oidcClientSecret` is recommended but optional (some IdPs accept public clients).
 */
export function validateCredentials(creds: OidcCredentials, grantType: GrantType): void {
  if (!creds.oidcClientId) {
    throw new Error('OIDC Client ID is required');
  }
  if (!creds.oidcIssuer && !creds.oidcTokenEndpoint) {
    throw new Error('Either OIDC Issuer or OIDC Token Endpoint must be provided');
  }

  if (grantType === 'client_credentials') {
    if (!creds.oidcClientSecret) {
      throw new Error('OIDC Client Secret is required for the Client Credentials grant');
    }
  } else if (grantType === 'password') {
    if (!creds.oidcUsername || !creds.oidcPassword) {
      throw new Error(
        'Resource Owner Username and Password are required for the Password grant (configure them in the OIDC credential)',
      );
    }
  }
}

/**
 * Resolve the token endpoint (and optionally the JWKS URI) by either using the
 * explicitly supplied token endpoint or auto-discovering it from the issuer.
 */
export async function resolveEndpoints(
  ctx: IExecuteFunctions,
  creds: OidcCredentials,
): Promise<{ tokenEndpoint: string; jwksUri?: string }> {
  if (!creds.oidcIssuer) {
    return {
      tokenEndpoint: creds.oidcTokenEndpoint,
      jwksUri: creds.oidcJwksUri || undefined,
    };
  }

  const doc = await fetchDiscoveryDocument(ctx, creds.oidcIssuer);
  if (!doc.token_endpoint) {
    throw new Error('Discovery document did not contain a token_endpoint');
  }
  return {
    tokenEndpoint: doc.token_endpoint,
    jwksUri: creds.oidcJwksUri || doc.jwks_uri,
  };
}

export type GrantType = 'client_credentials' | 'password';

/**
 * Build the form-urlencoded body for an OAuth2 token request.
 *
 * Client credentials are sent as HTTP Basic Auth per RFC 6749 §2.3.1 when a
 * client secret is configured. For public clients (no secret), the client id
 * is sent in the body instead. The `password` (Resource Owner Password
 * Credentials) grant additionally places `username` and `password` in the
 * body per RFC 6749 §4.3.
 */
function buildTokenRequest(
  tokenEndpoint: string,
  creds: OidcCredentials,
  grantType: GrantType,
  scope?: string,
): IHttpRequestOptions {
  const body = new URLSearchParams();
  body.set('grant_type', grantType);
  if (scope) body.set('scope', scope);

  if (grantType === 'password') {
    if (!creds.oidcUsername || !creds.oidcPassword) {
      throw new Error(
        'Resource Owner Username and Password are required for the Password grant (configure them in the OIDC credential)',
      );
    }
    body.set('username', creds.oidcUsername);
    body.set('password', creds.oidcPassword);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  if (creds.oidcClientSecret) {
    const basic = Buffer.from(`${creds.oidcClientId}:${creds.oidcClientSecret}`).toString('base64');
    headers.Authorization = `Basic ${basic}`;
  } else {
    body.set('client_id', creds.oidcClientId);
  }

  return {
    method: 'POST',
    url: tokenEndpoint,
    headers,
    body,
    json: true,
  };
}

/**
 * Request an access token from the token endpoint using the given OAuth2 grant.
 */
export async function fetchToken(
  ctx: IExecuteFunctions,
  tokenEndpoint: string,
  creds: OidcCredentials,
  grantType: GrantType,
  scope?: string,
): Promise<IDataObject> {
  const options = buildTokenRequest(tokenEndpoint, creds, grantType, scope);
  return ctx.helpers.httpRequest(options) as Promise<IDataObject>;
}

/**
 * Base64url-decode a JWT segment into a UTF-8 string and JSON-parse it.
 */
function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const json = Buffer.from(padded + pad, 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Decode a JWT into its header, payload, and signature without verifying the signature.
 */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 segments separated by "."');
  }
  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) {
    throw new Error('Invalid JWT: header, payload and signature are all required');
  }
  return {
    header: decodeSegment(header),
    payload: decodeSegment(payload),
    signature,
  };
}

/**
 * Resolve the token signing algorithm from the JWT header. The header alg is
 * authoritative; we never fall back to the JWK alg, since that would let an
 * attacker downgrade or substitute algorithms (a well-known JWT confusion vector).
 */
function resolveAlgorithm(header: Record<string, unknown>): string {
  const alg = header.alg as string | undefined;
  if (!alg) throw new Error('JWT is missing the "alg" header');
  const cryptoAlg = algToCryptoAlg[alg];
  if (!cryptoAlg) throw new Error(`Unsupported JWT algorithm: ${alg}`);
  return alg;
}

/** Map a JWT alg to the Node crypto digest name used by createVerify. */
function algorithmHashName(alg: string): string {
  return algToCryptoAlg[alg];
}

/** Convert a JWK into a Node KeyObject suitable for signature verification. */
function toKeyObject(jwk: Jwk): KeyObject {
  return createPublicKey({ key: jwk as Record<string, unknown>, format: 'jwk' });
}

/**
 * Select the JWK that must be used to verify the token. The selection rules
 * are strict to prevent key/algorithm confusion attacks:
 *
 *  - If the JWT header contains a `kid`, the JWKS MUST contain a key with a
 *    matching `kid`; otherwise verification is rejected. We never fall back to
 *    an unrelated key when a `kid` is specified.
 *  - The selected key's `kty` must be consistent with the JWT alg (RSA* → RSA,
 *    ES* → EC), and the key must be marked for signature use (or have no `use`).
 *  - The JWT alg plays no role in selecting the key: an attacker cannot
 *    influence which key is chosen by setting an arbitrary `alg`.
 */
function selectJwk(jwks: Jwk[], header: Record<string, unknown>): Jwk | undefined {
  const kid = header.kid as string | undefined;

  const signatureKeys = jwks.filter((k) => {
    if (!k.kty) return false;
    if (k.use && k.use !== 'sig') return false;
    return true;
  });

  if (kid) {
    const match = signatureKeys.find((k) => k.kid === kid);
    if (!match) {
      throw new Error(`JWKS does not contain a key with kid "${kid}"`);
    }
    return match;
  }

  // No kid in the header: only acceptable when the JWKS has exactly one signing key.
  if (signatureKeys.length === 1) {
    return signatureKeys[0];
  }

  if (signatureKeys.length === 0) {
    return undefined;
  }

  throw new Error('JWT header has no "kid" and the JWKS contains multiple signing keys; cannot safely select a key');
}

/**
 * Ensure the key type is consistent with the JWT algorithm so that, e.g., an
 * RS256 token is never verified against an EC public key.
 */
function assertKeyAlgConsistency(jwk: Jwk, alg: string): void {
  const kty = jwk.kty;
  if (alg.startsWith('RS') || alg.startsWith('PS')) {
    if (kty !== 'RSA') {
      throw new Error(`JWT alg "${alg}" requires an RSA key but the JWK kty is "${kty}"`);
    }
  } else if (alg.startsWith('ES')) {
    if (kty !== 'EC') {
      throw new Error(`JWT alg "${alg}" requires an EC key but the JWK kty is "${kty}"`);
    }
  }
}

/**
 * Cryptographically verify a JWT against keys fetched from a JWKS URI.
 * Verification implicitly decodes the token first.
 */
export async function verifyJwt(ctx: IExecuteFunctions, token: string, opts: VerifyOptions): Promise<DecodedJwt> {
  const decoded = decodeJwt(token);
  const { header, payload, signature } = decoded;

  if (typeof signature !== 'string' || signature.length === 0) {
    throw new Error('JWT has no signature');
  }

  const alg = resolveAlgorithm(header);

  if (!opts.jwksUri) {
    throw new Error('OIDC JWKS URI is required to verify the token signature');
  }

  const jwksOptions: IHttpRequestOptions = {
    method: 'GET',
    url: opts.jwksUri,
    headers: { Accept: 'application/json' },
    json: true,
  };
  const jwks = (await ctx.helpers.httpRequest(jwksOptions)) as JwksResponse;
  if (!jwks.keys || jwks.keys.length === 0) {
    throw new Error('JWKS response did not contain any keys');
  }

  const jwk = selectJwk(jwks.keys, header);
  if (!jwk) {
    throw new Error('Could not find a matching JWK for the JWT');
  }
  assertKeyAlgConsistency(jwk, alg);
  const keyObject = toKeyObject(jwk);

  // Claim validation happens after we have a key but is independent of it.
  const clockTolerance = opts.clockTolerance ?? 0;

  if (typeof payload.exp !== 'number') {
    throw new Error('JWT does not contain an "exp" claim; expiry is required for verification');
  }
  const now = Math.floor(Date.now() / 1000);
  if (now > payload.exp + clockTolerance) {
    throw new Error(`JWT has expired (exp: ${payload.exp}, now: ${now})`);
  }

  if (opts.expectedIssuer && payload.iss !== opts.expectedIssuer) {
    throw new Error(`JWT issuer mismatch: expected ${opts.expectedIssuer}, got ${payload.iss ?? '<none>'}`);
  }

  if (opts.expectedAudience) {
    const aud = payload.aud;
    const audiences = Array.isArray(aud) ? aud : aud === undefined ? [] : [aud];
    if (!audiences.includes(opts.expectedAudience)) {
      throw new Error(`JWT audience mismatch: expected ${opts.expectedAudience}`);
    }
  }

  const parts = token.split('.');
  const signedData = `${parts[0]}.${parts[1]}`;
  const hashAlg = algorithmHashName(alg);
  const verifier = createVerify(hashAlg);
  verifier.update(signedData, 'utf8');

  const signatureBuffer = Buffer.from(signature, 'base64url');
  const isEcdsa = alg.startsWith('ES');
  const verifyOptions: {
    key: KeyObject;
    dsaEncoding?: 'ieee-p1363';
    padding?: number;
  } = { key: keyObject };
  if (isEcdsa) {
    verifyOptions.dsaEncoding = 'ieee-p1363';
  } else if (alg.startsWith('PS')) {
    verifyOptions.padding = cryptoConstants.RSA_PKCS1_PSS_PADDING;
  }
  const valid = verifier.verify(verifyOptions, signatureBuffer);

  if (!valid) {
    throw new Error('JWT signature verification failed');
  }

  return decoded;
}
