# Node Operations

This document describes every property available in the OIDC Token node as seen in the n8n UI.

## Node Properties

| Property                  | Type    | Required | Default              | Description                                                                    |
| ------------------------- | ------- | -------- | -------------------- | ------------------------------------------------------------------------------ |
| Grant Type                | options | Yes      | `Client Credentials` | The OAuth2 grant type used to request an access token                          |
| Token Processing Mode     | options | Yes      | `None`               | How to process the retrieved JWT access token                                  |
| Scope                     | string  | No       | —                    | Optional space-separated OAuth2 scope(s)                                       |
| Clock Tolerance (seconds) | number  | No       | `0`                  | Leeway applied to `exp`/`iat` checks. Shown only when Processing Mode = Verify |
| Expected Issuer           | string  | No       | —                    | Validates the JWT `iss` claim. Shown only when Processing Mode = Verify        |
| Expected Audience         | string  | No       | —                    | Validates the JWT `aud` claim. Shown only when Processing Mode = Verify        |

The resource owner's **Username** and **Password** for the Password grant are configured on the **OIDC credential**, not on the node — see [Credentials](./credentials.md).

The node subtitle displays the current selection as `={{$parameter["grantType"] + " / " + $parameter["processingMode"]}}`.

---

## Grant Type

Determines the OAuth2 flow used to acquire the access token.

### Client Credentials (default)

Machine-to-machine flow. The node sends:

```
grant_type=client_credentials
&scope=<scope>
```

Client id/secret are sent via HTTP Basic Auth. No user is involved. Use this for service-to-service access where the workflow itself is the resource owner.

Reference: [RFC 6749 §4.4](https://datatracker.ietf.org/doc/html/rfc6749#section-4.4)

### Password (Resource Owner Password Credentials)

Delegated-user flow. The node additionally sends the resource owner's credentials in the body, sourced from the **OIDC credential** (Resource Owner Username / Password fields):

```
grant_type=password
&username=<username>
&password=<password>
&scope=<scope>
```

When a Client Secret is configured, it is still sent via Basic Auth. For public clients (no secret), the `client_id` is sent in the body instead. Use this only when the workflow has the resource owner's credentials (e.g. legacy integrations) and the IdP has enabled the password grant for the client.

> **Security note:** The Password grant is deprecated in OAuth 2.1 because it exposes user credentials to the client. Prefer Authorization Code with PKCE for interactive users. This node exposes the grant for legacy compatibility.

Reference: [RFC 6749 §4.3](https://datatracker.ietf.org/doc/html/rfc6749#section-4.3)

---

## Token Processing Mode

Determines how (or whether) the returned JWT access token is inspected before being emitted.

### None (default)

Outputs the raw token JSON response from the IdP unchanged:

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 300,
  "scope": "openid profile"
}
```

No `tokenClaims` or `decodedToken` properties are added. Use this when downstream nodes only need the raw `access_token` string.

### Decode

Base64url-decodes the JWT payload **without** checking the signature and appends two properties to the output:

- `tokenClaims` — the decoded payload (the JWT claims) as a JSON object
- `decodedToken` — `{ header, payload, signature }` (all three JWT segments)

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 300,
  "tokenClaims": {
    "iss": "https://login.example.com/realms/test",
    "sub": "client-1",
    "exp": 1735689600,
    "iat": 1735689300,
    "aud": "account"
  },
  "decodedToken": {
    "header": { "alg": "RS256", "typ": "JWT", "kid": "test-kid" },
    "payload": { "iss": "...", "sub": "...", "exp": 1735689600, "...": "..." },
    "signature": "k3M..."
  }
}
```

Use this for quick inspection/troubleshooting where you trust the source of the token (e.g. it just came from your own IdP) and don't need cryptographic assurance.

### Verify

Performs full cryptographic verification of the JWT signature against the JWKS, **and** decodes the token (implies Decode). Specifically:

1. Decodes the JWT header and payload.
2. Resolves the signing algorithm from the header `alg` (RS*/PS*/ES\*).
3. Fetches the JWKS from `OIDC JWKS URI` (or from the discovery `jwks_uri`).
4. Selects the matching key by `kid` (strict — rejects if no match).
5. Asserts the key type matches the algorithm family.
6. Validates the `exp` claim (required; honoured against Clock Tolerance).
7. Optionally validates `iss` against Expected Issuer.
8. Optionally validates `aud` against Expected Audience.
9. Cryptographically verifies the signature with `crypto.createVerify()`.

On success, the output is identical to Decode mode (raw token + `tokenClaims` + `decodedToken`). On failure, the node throws (or, with `continueOnFail`, emits `{ error: message }`).

Use this when downstream decisions depend on the token being authentic and fresh — e.g. before calling a protected API that honours the same JWT, or when routing based on claims.

---

## Output Payload Structure

When Processing Mode is `Decode` or `Verify`, the original token response payload is enriched with two new properties:

| Property       | Type   | Description                                                              |
| -------------- | ------ | ------------------------------------------------------------------------ |
| `tokenClaims`  | object | The decoded JWT payload (claims). Convenient for downstream expressions. |
| `decodedToken` | object | `{ header, payload, signature }` — the full decoded JWT structure.       |

The original fields (`access_token`, `token_type`, `expires_in`, `scope`, etc.) remain untouched.

---

## Conditional Field Visibility

n8n's `displayOptions` controls which node fields are shown based on the current selections:

| Field             | Visible when              |
| ----------------- | ------------------------- |
| Clock Tolerance   | `processingMode = verify` |
| Expected Issuer   | `processingMode = verify` |
| Expected Audience | `processingMode = verify` |

> Note: Username and Password are **credential** fields, not node fields, so they are always available on the OIDC credential regardless of the node's Grant Type selection. They are only used when Grant Type = Password; see [Credentials](./credentials.md).

---

## Recipes

### Client Credentials + Verify (most secure M2M)

1. Credential: OIDC Issuer = `https://login.example.com/realms/myrealm`, Client ID/Secret set.
2. Grant Type: `Client Credentials`
3. Processing Mode: `Verify`
4. Expected Issuer: `https://login.example.com/realms/myrealm`
5. Optional: Expected Audience = your downstream API's audience.

The output `access_token` is cryptographically validated and its claims are available in `tokenClaims` for downstream branching.

### Password grant (legacy user delegation)

1. Credential: Resource Owner Username / Password set (client must have `password` grant enabled in the IdP). Client Secret optional (set it for confidential clients; leave blank for public clients).
2. Grant Type: `Password`
3. Processing Mode: `Decode` (or `Verify` if JWKS is available).

### Token inspection only (no fetch)

This node always fetches a fresh token. To inspect an existing JWT without fetching, use a Code node with the `decodeJwt` logic — the OIDC Token node's role is acquisition + verification, not standalone decoding.
