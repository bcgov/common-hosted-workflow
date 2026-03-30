# Credentials

The node uses the `workflowInteractionLayerApi` credential type. Configure it in n8n under **Settings → Credentials → Add Credential → Workflow Interaction Layer API**.

## Credential Fields

| Field                        | Type              | Required | Default                 | Description                                                                        |
| ---------------------------- | ----------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------- |
| Base URL                     | string            | Yes      | `http://localhost:5678` | Base URL of the n8n instance hosting the WIL-API Layer                             |
| n8n API Key                  | string (password) | Yes      | —                       | n8n API key used as `X-N8N-API-KEY` header                                         |
| Tenant ID                    | string            | Yes      | —                       | Tenant identifier sent as `X-TENANT-ID` header                                     |
| Allowed HTTP Request Domains | options           | No       | `all`                   | Controls which domains the credential can reach when used in the HTTP Request node |
| Allowed Domains              | string            | No       | —                       | Comma-separated domain list (only shown when "Specific Domains" is selected)       |

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
