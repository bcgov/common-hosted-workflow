# CHEFS API credentials

Select **CHEFS API** (`chefsApi`) for the CHEFS node. Both credential fields are required, password-masked, nonblank strings:

| Credential field    | Serialized property  | Purpose                                                                |
| ------------------- | -------------------- | ---------------------------------------------------------------------- |
| Authorization Token | `authorizationToken` | Local shared secret compared with the node's Authorization Token       |
| API Key             | `apiKey`             | CHEFS form API key, used as the upstream Basic authentication password |

## Two separate authentication layers

### 1. Local shared-secret check

Set the credential Authorization Token to the shared secret used by your workflow's caller/integration. Provide the same value in the node's Authorization Token field, directly or through an expression. The node compares their UTF-8 bytes exactly, using a timing-safe comparison for equal-length byte sequences. It does not lowercase, trim, coerce or Unicode-normalize either token. All-whitespace values reject.

This check occurs locally before the HTTP request. It does not validate a JWT, a Bearer token or an upstream CHEFS login. Neither local token is sent to CHEFS by this node.

### 2. Upstream CHEFS Basic authentication

Obtain an API key for your CHEFS form and store it in the credential's **API Key** field. Put the corresponding **Form ID** in the node's Form ID field. The node sends:

```text
authorization: Basic base64(UTF-8(formID + ":" + apiKey))
```

Form ID is the Basic username and API key is the Basic password. This is required for all three operations, including paths containing only a Submission ID. The API key's case and whitespace are preserved; missing, nonstring, empty and whitespace-only keys fail locally. The node does not form-encode either Basic component.

The separate **CHEFS Form Authentication** (`chefsFormAuth`) credential belongs to other CHEFS-related nodes. This node continues to use `chefsApi`, with Form ID on the node and the fixed production API base URL. Configure the credential type selected by the node rather than substituting the sibling credential.

## Troubleshooting and migration

- **Node/Credential Authorization Token must be a nonblank string:** populate both token fields with text; an expression must return a nonblank string.
- **Authorization failed: Token mismatch:** check exact case, leading/trailing whitespace and Unicode representation. Local tokens must agree byte-for-byte.
- **Credential API Key must be a nonblank string:** supply the form's actual API key.
- **Form ID/Submission ID must be a nonblank string:** supply the required identifier for the [selected operation](./node-operations.md).
- **Upstream authentication error:** verify the Form ID/API key pair and upstream permissions after the local check passes.

See [release notes](./release-notes.md) for the stricter comparison policy and the [CHEFS API reference](https://submit.digital.gov.bc.ca/app/api/v1/docs) for upstream behavior.
