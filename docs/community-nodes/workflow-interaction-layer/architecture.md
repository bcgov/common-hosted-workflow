# Architecture

## Design Overview

The Workflow Interaction Layer sits between n8n workflows and external consumers (front-end applications, other services) that need to exchange messages and coordinate human-in-the-loop actions.

```
┌──────────────┐       ┌──────────────────────┐       ┌──────────────────┐
│  n8n Workflow │──────▶│  WIL-API Layer        │◀─────│  External App /  │
│  (this node)  │       │  /rest/custom/v1/*    │       │  Front-end       │
└──────────────┘       └──────────────────────┘       └──────────────────┘
```

The node is **programmatic** (uses an `execute()` method) because it needs to:

- Auto-inject `workflowId` and `workflowInstanceId` from the execution context
- Build custom auth headers from credentials and environment variables
- Support multiple resources and operations with shared HTTP logic

## Resources

The node exposes two top-level resources:

### Message

A notification or informational record sent to an actor. Messages are immutable once created (no update/delete operations). They carry a `title`, `body`, and optional `metadata`.

### Action

A trackable task assigned to an actor that expects a response. Actions support a full lifecycle (`pending` → `in_progress` → `completed` / `cancelled` / `expired` / `deleted`) and include a callback mechanism so external systems can notify the workflow when the action is resolved.

## Authentication Model

Every API request includes the following authentication/context headers:

| Header                          | Source                                     | Purpose                             |
| ------------------------------- | ------------------------------------------ | ----------------------------------- |
| `X-N8N-API-KEY`                 | Credential (`apiKey`)                      | Identifies the calling n8n instance |
| `Authorization: Bearer <token>` | Environment variable `INTERNAL_AUTH_TOKEN` | Internal service-to-service auth    |
| `X-TENANT-ID`                   | Credential (`tenantId`)                    | Multi-tenant isolation              |

The `workflowId` is sent in the request body on create operations (auto-populated from the workflow context), not as a header.

The `INTERNAL_AUTH_TOKEN` environment variable must be set on the n8n instance.

## Project Scoping

All data is scoped by `projectId` and `tenantId`:

- `projectId` is derived server-side from the `tenantId` in the API
- `tenantId` is sent explicitly from the credential configuration via the `X-TENANT-ID` header
- Every read operation filters results to the caller's project and tenant, ensuring data isolation

## Data Flow — Create Action Example

```
1. User configures node: resource=action, operation=create
2. execute() reads input items and loops over each
3. For each item:
   a. Reads node parameters (actorId, actionType, callbackUrl, etc.)
   b. Auto-injects workflowId (from workflow context) and workflowInstanceId (execution ID)
   c. Calls wilApiRequest(ctx, 'POST', '/actions', body)
   d. wilApiRequest:
      - Resolves baseUrl from credentials
      - Builds auth headers (API key, Bearer token, tenant ID)
      - Sends HTTP request via ctx.helpers.httpRequest()
   e. Response is wrapped with constructExecutionMetaData for item linking
4. Returns [returnData] — array of arrays per n8n convention
```

## Error Handling

The node follows n8n best practices:

- Each item is processed in a `try/catch` block
- `continueOnFail()` is respected — on failure, the item is emitted with `{ error: message }` instead of throwing
- HTTP/API errors throw `NodeApiError` (preserves status code and response body)
- Configuration/validation errors throw `NodeOperationError` (includes `itemIndex`)

## Shared Utilities — `GenericFunctions.ts`

| Function                                          | Purpose                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `getAuthHeaders(ctx)`                             | Builds the auth header object from credentials and env                                            |
| `getBaseUrl(ctx)`                                 | Resolves and normalizes the API base URL from credentials                                         |
| `wilApiRequest(ctx, method, path, body?, query?)` | Authenticated HTTP request to any WIL-API Layer endpoint                                          |
| `safeParse(val)`                                  | Safely parses JSON strings or passes through objects; returns `undefined` for empty/invalid input |
