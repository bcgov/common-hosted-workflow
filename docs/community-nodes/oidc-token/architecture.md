# Architecture

## Design Overview

The OIDC Token node bridges n8n workflows and an OpenID Connect Identity Provider. It acquires an OAuth2 access token for machine-to-machine or delegated-user authentication, and optionally inspects/validates the resulting JWT so downstream nodes receive both the raw token and its decoded claims.

```
┌──────────────┐       ┌────────────────────────┐       ┌──────────────────┐
│  n8n Workflow │──────▶│  OIDC Token Node        │──────▶│  IdP Token       │
│  (this node)  │       │  - resolve endpoints    │       │  Endpoint        │
│               │◀──────│  - fetch token           │◀──────│  (Keycloak/Okta) │
│               │       │  - decode/verify JWT     │       │                  │
│  downstream   │       │  - enrich + emit item    │       └──────────────────┘
│  nodes        │◀──────│                          │
└──────────────┘       └────────────────────────┘
```

The node is **programmatic** (uses an `execute()` method) because it needs to:

- Resolve the token endpoint either from the OIDC discovery document or from an explicit URL
- Build a `application/x-www-form-urlencoded` POST with the correct grant type
- Authenticate the client via HTTP Basic Auth
- Decode and (optionally) cryptographically verify a JWT against a JWKS
- Enrich the token response with parsed claims before emitting execution data

## Token Acquisition Flow

### 1. Endpoint resolution

The `resolveEndpoints()` helper decides where to send the token request:

| Credential state                            | Behaviour                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `oidcIssuer` set                            | `GET <issuer>/.well-known/openid-configuration` → read `token_endpoint` and `jwks_uri` |
| `oidcIssuer` empty, `oidcTokenEndpoint` set | Use the explicit endpoint; `jwks_uri` comes from `oidcJwksUri` (if provided)           |
| Both empty                                  | Throw a configuration error before any network call                                    |

If the discovery document has no `token_endpoint`, the node throws a clear error rather than failing later.

### 2. Token request

`fetchToken()` issues an HTTP POST to the resolved token endpoint:

```
POST <token_endpoint>
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(form_encode(client_id):form_encode(client_secret))
Accept: application/json

grant_type=<client_credentials|password>
&scope=<scope>                    (optional)
&username=<username>              (password grant only)
&password=<password>              (password grant only)
```

Client credentials are sent via **HTTP Basic Auth** (RFC 6749 §2.3.1) when a client secret is configured and never duplicated in the body. For public clients (no secret, Password grant only), the `client_id` is sent in the form body instead. The `password` grant additionally places the resource owner's username/password (sourced from the credential) in the form body (RFC 6749 §4.3).

Each Basic component is independently UTF-8 `application/x-www-form-urlencoded` encoded (including spaces as `+`) before the colon separator and Base64 encoding. Scope expressions are evaluated using each input item's index; grant type and processing mode are expression-disabled execution-wide selections.

### 3. Token processing

After the token is returned, the **Token Processing Mode** determines what happens next (see [Node Operations](./node-operations.md) for field-level detail):

```
None    → emit the raw token JSON as-is
Decode  → base64url-decode the JWT payload and append tokenClaims + decodedToken
Verify  → resolve JWKS key, verify signature, validate exp/nbf/iat/iss/aud, then append tokenClaims + decodedToken
```

`Verify` implicitly performs Decode (the decoded payload is available in the output regardless).

## Verification Model

When `Token Processing Mode = Verify`, the node performs cryptographic verification of the JWT signature using Node's built-in `crypto` module — no third-party JWT library is required.

### Algorithm support

| JWT `alg`     | Crypto operation                   | Key type |
| ------------- | ---------------------------------- | -------- |
| RS256/384/512 | `createVerify('RSA-SHA*')`         | RSA      |
| PS256/384/512 | RSA-SHA\* with PSS padding         | RSA      |
| ES256/384/512 | `createVerify('SHA*')`, ieee-p1363 | EC       |

### Security properties

The verification logic is intentionally strict to prevent well-known JWT confusion attacks:

1. **Algorithm is authoritative from the JWT header.** The JWK's `alg` is never used as a fallback. An attacker cannot trick the verifier into using a weaker algorithm by manipulating the key set.
2. **`kid` binding is enforced.** If the JWT header contains a `kid`, the JWKS **must** contain a key with a matching `kid`. If no match is found, verification is rejected — the node never falls back to an arbitrary key.
3. **No `kid` is only safe with a single key.** When the header omits `kid`, verification proceeds only if the JWKS contains exactly one signing key. With multiple keys, the node rejects (it cannot safely disambiguate).
4. **Key/algorithm consistency.** The selected JWK's `kty` must match the JWT `alg` family (RSA* → RSA, ES* → EC). A mismatch is rejected before any crypto operation.
5. **Temporal claims are enforced.** `exp` must be finite and numeric. Optional `nbf` and `iat` must also be finite numbers when present. All three checks honour **Clock Tolerance**, which must be a finite nonnegative number at runtime.
6. **Optional claim checks.** When **Expected Issuer** or **Expected Audience** are supplied, the `iss` / `aud` claims are validated; mismatches are rejected.

### Claims validated

| Claim | Validation                                                   | Condition                     |
| ----- | ------------------------------------------------------------ | ----------------------------- |
| `exp` | Required finite number; reject when `now >= exp + tolerance` | Verify mode (always)          |
| `nbf` | Optional finite number; reject when `nbf > now + tolerance`  | Verify mode (when present)    |
| `iat` | Optional finite number; reject when `iat > now + tolerance`  | Verify mode (when present)    |
| `iss` | Must equal **Expected Issuer**                               | Verify mode (when configured) |
| `aud` | Must contain **Expected Audience**                           | Verify mode (when configured) |

`now` is Unix time in whole seconds (`Math.floor(Date.now() / 1000)`). Fractional NumericDate claims and fractional tolerance are accepted. Numeric strings, `null`, booleans, objects, arrays, and nonfinite values are rejected. `iat` is optional, but future issuance beyond tolerance is rejected as an explicit node policy; it is not a maximum token-age check.

### Execution-local key reuse

`createJwksResolver()` encapsulates one cached JWKS request promise per execution. N items using known keys need one JWKS GET; the first unknown `kid` may trigger one additional GET for rotation, for at most two JWKS requests across the entire batch. If the key is still missing it fails; later unknown keys do not trigger more refreshes. No-`kid` ambiguity, non-signing keys, algorithm/type mismatches and invalid signatures do not trigger refresh. Failed fetch promises are retained, so Continue On Fail cannot create a request storm. A new execution starts with a fresh resolver; there is no global key cache or token cache.

## Project Scoping

There is no tenant/project concept in this node — it is a pure OAuth2 token acquisition and JWT inspection utility. All scoping is delegated to the downstream APIs that consume the emitted `access_token`.

## Data Flow — Client Credentials example

```
1. User configures node: grantType=client_credentials, processingMode=verify
2. execute() reads credentials and validates (issuer OR token endpoint, id+secret)
3. resolveEndpoints():
   a. discovery → GET /.well-known/openid-configuration → token_endpoint + jwks_uri
   b. OR use explicit oidcTokenEndpoint
4. For each input item:
   a. Evaluate item scope; fetchToken() → POST token endpoint (Basic auth, form body)
   b. Get access_token from response
   c. verifyJwt():
      - validate finite nonnegative clockTolerance
      - decode header/payload
      - resolve alg from header (no JWK fallback)
      - execution-local resolver → select JWK by kid (strict, one bounded rotation refresh)
      - assert kty matches alg family
      - validate exp/nbf/iat, iss, aud
      - createVerify() + verify(signature) → reject on mismatch
   d. Enrich response: tokenClaims + decodedToken
   e. constructExecutionMetaData → emit item
5. Returns [returnData] — array of arrays per n8n convention
```

For the Password grant, step 4a additionally sends `username`/`password` (from the OIDC credential) in the form body.

## Error Handling

The node follows n8n best practices:

- Each item is processed in a `try/catch` block
- `continueOnFail()` is respected — on failure, the item is emitted with `{ error: message }` instead of throwing
- HTTP/API errors (errors carrying a `response` property) throw `NodeApiError`
- Configuration/validation errors throw `NodeOperationError` (includes `itemIndex`)

Credential retrieval, execution-wide selections, credential validation, discovery, and the Verify-mode JWKS URI requirement form one memoized setup attempt. Setup runs inside the item error boundary. A failed setup causes **zero token POSTs**: with Continue On Fail, every input receives a paired `{ error: message }`; otherwise execution stops on the first item. Discovery is attempted at most once per execution, even on failure. Scope-expression, token-request, and token-verification failures affect the current item; with Continue On Fail later items proceed and retain pairing. No setup or network request runs for empty input.

Common error cases and their messages:

| Condition                             | Error message                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Neither issuer nor token endpoint set | `Either OIDC Issuer or OIDC Token Endpoint must be provided`                                                       |
| Missing client id                     | `OIDC Client ID is required`                                                                                       |
| Missing client secret (CC grant)      | `OIDC Client Secret is required for the Client Credentials grant`                                                  |
| Password grant missing username/pw    | `Resource Owner Username and Password are required for the Password grant (configure them in the OIDC credential)` |
| Discovery doc has no `token_endpoint` | `Discovery document did not contain a token_endpoint`                                                              |
| Verify mode without JWKS URI          | `Token Processing Mode is "Verify" but no JWKS URI could be resolved...`                                           |
| JWKS has no matching `kid`            | `JWKS does not contain a key with kid "<kid>"`                                                                     |
| Algorithm not supported               | `Unsupported JWT algorithm: <alg>`                                                                                 |
| `exp` missing or malformed            | `JWT must contain a finite numeric "exp" claim; expiry is required for verification`                               |
| `exp` expired                         | `JWT has expired (exp: <ts>, now: <ts>)`                                                                           |
| `nbf` in the future                   | `JWT is not yet valid (nbf)`                                                                                       |
| `iat` in the future                   | `JWT was issued in the future (iat)`                                                                               |
| Invalid tolerance                     | `Clock Tolerance must be a finite nonnegative number`                                                              |
| Signature invalid                     | `JWT signature verification failed`                                                                                |

## Shared Utilities — `GenericFunctions.ts`

| Function                                              | Purpose                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `fetchDiscoveryDocument(ctx, issuerUrl)`              | `GET <issuer>/.well-known/openid-configuration`                                                                |
| `validateCredentials(creds, grantType)`               | Enforces issuer OR token endpoint, plus per-grant-type secret/username/password checks                         |
| `resolveEndpoints(ctx, creds)`                        | Returns `{ tokenEndpoint, jwksUri }` via discovery or explicit configuration                                   |
| `fetchToken(ctx, endpoint, creds, grantType, scope?)` | Authenticated POST to the token endpoint for either grant type                                                 |
| `decodeJwt(token)`                                    | Base64url-decodes header/payload into `DecodedJwt` (no signature check)                                        |
| `createJwksResolver(ctx, jwksUri)`                    | Execution-local key resolver with one unknown-kid refresh and cached failures                                  |
| `verifyJwt(ctx, token, opts, resolveJwk?)`            | Strict JWKS-based signature verification + claim validation (implies decode); accepts the execution's resolver |
