# Credentials

The node uses two credential types:

| Credential                    | Required                       | Purpose                                                             |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `workflowInteractionLayerApi` | Always                         | Authenticates every request to the WIL-API Layer                    |
| `chefsFormAuth`               | Only for the `showform` action | Supplies the CHEFS form ID and API key used to render/submit a form |

## Workflow Interaction Layer API

Configure it in n8n under **Settings → Credentials → Add Credential → Workflow Interaction Layer API**.

### Credential Fields

| Field                        | Type              | Required | Default                 | Description                                                                        |
| ---------------------------- | ----------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------- |
| Base URL                     | string            | Yes      | `http://localhost:5678` | Base URL of the n8n instance hosting the WIL-API Layer                             |
| n8n API Key                  | string (password) | Yes      | —                       | n8n API key used as `X-N8N-API-KEY` header                                         |
| Tenant ID                    | string            | Yes      | —                       | Tenant identifier sent as `X-TENANT-ID` header                                     |
| Allowed HTTP Request Domains | options           | No       | `all`                   | Controls which domains the credential can reach when used in the HTTP Request node |
| Allowed Domains              | string            | No       | —                       | Comma-separated domain list (only shown when "Specific Domains" is selected)       |

## CHEFS Form Authentication (`chefsFormAuth`)

Required whenever **Action Type** is set to **Show Form** (on the Create or Create, Wait and Get Data operations). Select or create the credential in the node's **Credentials** section — it only appears once `showform` is selected as the Action Type.

Configure it in n8n under **Settings → Credentials → Add Credential → CHEFS Form Authentication**.

### Credential Fields

| Field     | Type              | Required | Description                                                |
| --------- | ----------------- | -------- | ---------------------------------------------------------- |
| Form Name | string            | No       | Display name for the form, shown in the external UI        |
| Form ID   | string            | Yes      | CHEFS form ID to render                                    |
| API Key   | string (password) | Yes      | CHEFS form API key used server-side to obtain a form token |
| Base URL  | string            | No       | CHEFS instance base URL, if different from the default     |

This credential is now the **only** place the CHEFS form ID and API key are configured. The node no longer has `CHEFS Form Name`/`CHEFS Form ID`/`CHEFS Form API Key` parameters — it forwards only the credential's ID (`chefsCredentialId`) in the action payload. external-hooks resolves and decrypts the credential server-side when the form is opened, using n8n's own credential-decryption mechanism, so the raw API key never appears in node output, execution data, or the `action_requests` payload. See [Architecture](./architecture.md) for the resolution flow.

One `chefsFormAuth` credential corresponds to one CHEFS form — if a workflow renders multiple different forms, create one credential per form.

## Environment Variable

In addition to the credential fields, the n8n instance must have the following environment variable set:

```
INTERNAL_AUTH_TOKEN=<your-secret-token>
```

This token is sent as `Authorization: Bearer <token>` on every request.

## How Headers Are Built

The `getAuthHeaders()` function in `shared/GenericFunctions.ts` assembles the full header set:

```
X-N8N-API-KEY:    <credentials.apiKey>
Authorization:    Bearer <INTERNAL_AUTH_TOKEN env var>
X-TENANT-ID:      <credentials.tenantId>
Accept:           application/json
Content-Type:     application/json
```

## Local Development

For local development, use these values:

| Field                     | Value                    |
| ------------------------- | ------------------------ |
| Base URL                  | `http://localhost:5678`  |
| n8n API Key               | Any non-empty string     |
| Tenant ID                 | Your tenant UUID         |
| `INTERNAL_AUTH_TOKEN` env | Your internal auth token |
