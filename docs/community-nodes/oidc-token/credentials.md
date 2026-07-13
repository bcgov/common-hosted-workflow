# Credentials

The node uses the `oidcToken` credential type. Configure it in n8n under **Settings → Credentials → Add Credential → OIDC**.

## Credential Fields

| Field                   | Type              | Required        | Default | Description                                                                                                       |
| ----------------------- | ----------------- | --------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| OIDC Issuer             | string            | Conditional\*   | —       | Base URL of the Identity Provider. Endpoints are auto-discovered via `/.well-known/openid-configuration`.         |
| OIDC Token Endpoint     | string            | Conditional\*   | —       | Direct token endpoint URL. Used when OIDC Issuer is not provided.                                                 |
| OIDC JWKS URI           | string            | No              | —       | URL of the JSON Web Key Set used to cryptographically verify token signatures. Auto-discovered when using Issuer. |
| OIDC Client ID          | string            | Yes             | —       | The client ID registered with the Identity Provider.                                                              |
| OIDC Client Secret      | string (password) | Conditional\*\* | —       | The client secret. Required for Client Credentials; optional for Password (public clients).                       |
| Resource Owner Username | string            | Conditional\*\* | —       | The resource owner username. Required for Password grant; ignored for Client Credentials.                         |
| Resource Owner Password | string (password) | Conditional\*\* | —       | The resource owner password. Required for Password grant; ignored for Client Credentials.                         |

> \***Conditional (discovery):** Exactly one of **OIDC Issuer** or **OIDC Token Endpoint** must be provided. If both are empty, the node throws a configuration error at execution time. If both are set, the Issuer takes precedence (discovery is used).

> \*\***Conditional (grant-type-aware):** `OIDC Client Secret`, `Resource Owner Username`, and `Resource Owner Password` are **all optional at the credential level** so a single credential can support both grant types. Which fields are actually required is enforced at execution time based on the node's **Grant Type** selection:

| Grant Type         | Required credential fields    | Optional fields                 |
| ------------------ | ----------------------------- | ------------------------------- |
| Client Credentials | Client ID, Client Secret      | Username, Password (ignored)    |
| Password           | Client ID, Username, Password | Client Secret (sent if present) |

The credential field descriptions (tooltips in the n8n UI) document which grant type each field applies to, so you can decide what to fill in based on the flow you intend to use.

## Endpoint Discovery

### Option A — OIDC Issuer (recommended)

Provide the Issuer base URL (e.g. `https://login.example.com/realms/myrealm`). The node fetches:

```
GET <issuer>/.well-known/openid-configuration
```

and reads `token_endpoint` and `jwks_uri` from the discovery document. This is the recommended approach because it keeps endpoint configuration in sync with the IdP.

### Option B — OIDC Token Endpoint (direct)

If you cannot use discovery (e.g. a non-standard IdP or a restricted network), leave the Issuer blank and provide the token endpoint URL directly:

```
https://login.example.com/realms/myrealm/protocol/openid-connect/token
```

In this mode you must also supply **OIDC JWKS URI** yourself if you want to use the `Verify` processing mode.

## Client Authentication

When a **Client Secret** is configured, the node authenticates to the token endpoint using **HTTP Basic Auth** per [RFC 6749 §2.3.1](https://datatracker.ietf.org/doc/html/rfc6749#section-2.3.1):

```
Authorization: Basic base64(client_id:client_secret)
```

For **public clients** (no secret — only valid on the Password grant), the secret is omitted and the `client_id` is sent in the form body instead:

```
grant_type=password&username=...&password=...&client_id=...
```

The appropriate behaviour is chosen automatically based on whether `OIDC Client Secret` is filled in.

## Example: Keycloak

| Field              | Value                                      |
| ------------------ | ------------------------------------------ |
| OIDC Issuer        | `https://login.example.com/realms/myrealm` |
| OIDC JWKS URI      | _(left blank — auto-discovered)_           |
| OIDC Client ID     | `my-m2m-client`                            |
| OIDC Client Secret | `••••••••••••`                             |

## Example: Direct endpoint (no discovery)

| Field               | Value                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| OIDC Issuer         | _(blank)_                                                                |
| OIDC Token Endpoint | `https://login.example.com/realms/myrealm/protocol/openid-connect/token` |
| OIDC JWKS URI       | `https://login.example.com/realms/myrealm/protocol/openid-connect/certs` |
| OIDC Client ID      | `my-m2m-client`                                                          |
| OIDC Client Secret  | `••••••••••••`                                                           |

## Local Development

For local development, any OIDC-compliant IdP can be used. A quick way to test is to run Keycloak in Docker:

```bash
docker run -p 8080:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN=admin quay.io/keycloak/keycloak:latest start-dev
```

Then configure the credential against `http://localhost:8080/realms/test` and create a confidential client with `client_credentials` (and optionally `password`) in the client's **Capability config**.
