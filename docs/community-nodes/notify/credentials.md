# Notify API credentials

Select **Notify API** (`notifyApi`) for the Notify node. Both credential fields are required:

| Credential field | Serialized property | Purpose                                                                                                         |
| ---------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Base URL         | `baseUrl`           | Notify API gateway base (e.g. `https://notify-api.example.ca`); all request paths resolve against it            |
| API Key          | `apiKey`            | Notify API key, sent as the `X-API-KEY` header on every versioned call; password-masked, never logged or echoed |

## Base URL (gateway guidance)

No production host is hardcoded. Set **Base URL** to your environment's Notify gateway URL (the credential placeholder shows the `https://notify-api.example.ca` shape). The node resolves versioned routes as `<baseUrl>/api/v1/...` and health as `<baseUrl>/api/health`. Use the gateway default for your environment; do not point n8n at a hardcoded host from another environment.

## API key

Store the Notify API key in **API Key** (`apiKey`, `typeOptions: { password: true }`). The node sends it verbatim as:

```text
X-API-KEY: <apiKey>
```

Missing, non-string, empty, or whitespace-only keys fail locally with `Credential API Key must be a nonblank string` before any request is sent. Keys never appear in error messages.

Keys carrying the `NOTIFY_TEMPLATE_EDITOR` role may additionally create, update, and delete templates; keys without it receive a pass-through upstream `403` on those operations. Keys for tenants without SMS receive a pass-through `403` on SMS sends. The node does not pre-validate roles — see [node operations](./node-operations.md).

## Health needs no authentication

**Service / Check health** (`GET /api/health`, unversioned, `@Public()` upstream) sends no `X-API-KEY`, so it is safe to use as an availability probe. It still builds its request URL from the credential's **Base URL** (`<baseUrl>/api/health`), so Base URL must be set to an absolute `http(s)` URL or the operation fails locally with a `Base URL (baseUrl) ...` message instead of sending. All other resources (Send, Notification status, Templates, Webhooks) require the full credential.

## Troubleshooting

- **Base URL (baseUrl) must be set ... / must be an absolute http(s) URL ...:** fill **Base URL** in the credential with your gateway URL including the scheme (e.g. `https://notify-api.example.ca`). This also applies to **Service / Check health**, which needs no API key but still resolves `<baseUrl>/api/health`.
- **Credential API Key must be a nonblank string:** supply the actual Notify API key.
- **Notification/Template/Callback ID must be a nonblank string:** supply the required identifier for the [selected operation](./node-operations.md); identifiers are non-blank strings (UUID format documented, not grammar-enforced).
- **Upstream 401/403:** verify the base URL points at the right gateway and the key is valid; for template `403`s also check the `NOTIFY_TEMPLATE_EDITOR` role, and for SMS `403`s check tenant SMS enablement.
- **Callback URL must be an https URL:** webhook URLs must be https; plain http is rejected locally before transport.

See [release notes](./release-notes.md) for the initial-release contract.
