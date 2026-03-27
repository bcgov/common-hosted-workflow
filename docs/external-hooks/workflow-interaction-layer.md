# Workflow Interaction Layer (Message APIs)

These endpoints manage `messages` in the custom DB (`CUSTOM_DATABASE_URL`), associated to n8n projects via `tenant_project_relation` and `workflowId -> projectId` mapping.

## Prerequisite

Before testing or using these APIs, add tenant/project mapping data manually in `tenant_project_relation` so each target `project_id` is linked to the correct `tenant_id`.

## Endpoints

All endpoints require:

- Header `X-N8N-API-KEY`
- Header `X-TENANT-ID` (UUID)

### Common tenant and project checks (internal + external)

For both GET and POST, API processing continues only when all checks pass:

- resolve `project_id`s for `X-TENANT-ID` from `tenant_project_relation`
- intersect with caller's n8n-accessible projects
- resolve `workflowId` project mapping and verify overlap with the scoped projects

| Method | Path                                       |
| ------ | ------------------------------------------ |
| `GET`  | `/rest/custom/v1/messages/`                |
| `GET`  | `/rest/custom/v1/actors/:actorId/messages` |

### Internal access (from an n8n workflow)

Internal calls must include:

- Header `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`

Rules:

- Internal `POST` is allowed only when bearer token equals `INTERNAL_AUTH_TOKEN`.
- Internal calls must also include `X-TENANT-ID` and pass the same tenant/user/workflow checks as external calls.

| Method | Path                        |
| ------ | --------------------------- |
| `POST` | `/rest/custom/v1/messages/` |

## GET query params

For `GET /rest/custom/v1/messages/`:

- `actorId` (optional string)
- `since` (optional ISO 8601 datetime string; rows with `createdAt >= since`)
- `limit` (optional integer `1..200`, default `50`)

Example:
`GET /rest/custom/v1/messages/?actorId={{actorId}}&since=2026-03-26T10:30:00Z&limit=25`

## POST body (`POST /rest/custom/v1/messages/`)

Required fields:

- `title` (string)
- `body` (string)
- `actorId` (string)
- `actorType` one of: `user`, `role`, `group`, `system`, `other`
- `workflowInstanceId` (string)
- `workflowId` (string)

Optional fields:

- `projectId` (string). If provided, it must be within workflow + tenant + user scoped projects.
- `metadata` (object)
- `status` (`active` | `read`)
- If `projectId` is omitted and exactly one scoped project is available, that project is used.
- If multiple scoped projects are available, `projectId` must be provided.

Headers for internal call:

- `X-N8N-API-KEY: {{api_key}}`
- `X-TENANT-ID: {{tenant_id}}`
- `Authorization: Bearer {{internal_token}}`

Example body:

```json
{
  "title": "Workflow needs approval",
  "body": "Please review step 3 before continuing.",
  "actorId": "665601d6-0fdd-4dd7-9396-2480b183196a",
  "actorType": "user",
  "workflowInstanceId": "550e8400-e29b-41d4-a716-446655440000",
  "workflowId": "WKDGMqR0J2YJZirfB0mzr",
  "status": "active",
  "metadata": { "priority": "high", "source": "postman" }
}
```

## Postman variables

Set:

- `base_url`
- `api_key`
- `internal_token` = `INTERNAL_AUTH_TOKEN` (secret)
- `tenant_id` (UUID)
- `workflow_id`
- `actorId`
