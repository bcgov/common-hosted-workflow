# Workflow interaction layer — API reference (messages & actions)

HTTP API for **`messages`** and **`action_requests`** in the custom database (`CUSTOM_DATABASE_URL`), scoped by tenant and n8n project access.

**Headers, middleware, and n8n execution checks:** [`workflow-interaction-api-validations.md`](./workflow-interaction-api-validations.md).

**Admin APIs** (including tenant–project setup): [`custom-api.md`](./custom-api.md).

---

## Prerequisite (required before testing)

1. **Create a tenant–project mapping** using the admin API
   **`POST /rest/custom/admin/tenant-project-relation`** with body `{ "tenantId": "<uuid>", "projectId": "<n8n project id>" }`.
   Workflow interaction routes resolve **`X-TENANT-ID`** against **`tenant_project_relation`**; without a row, requests fail with **403** (no projects for tenant).

2. The **API key user** must have n8n access to that **`project_id`** (personal or shared project). Otherwise the tenant/caller intersection is empty (**403**).

3. For **POST** create on messages or actions, configure **`INTERNAL_AUTH_TOKEN`** and send **`Authorization: Bearer <token>`** in addition to the headers below.

Until (1) and (2) are satisfied, **GET** and **POST** workflow interaction calls will not reach business logic successfully.

---

## Common headers

| Header                    | Required         | Notes                                          |
| ------------------------- | ---------------- | ---------------------------------------------- |
| `X-N8N-API-KEY`           | Yes              | Identifies the caller in n8n.                  |
| `X-TENANT-ID`             | Yes              | UUID; must exist in `tenant_project_relation`. |
| `Authorization: Bearer …` | POST create only | Must equal `INTERNAL_AUTH_TOKEN`.              |

Base path for all routes below: **`/rest/custom/v1`**.

---

## Messages

| Method | Path                        | Description                                                                                                                                         |
| ------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/messages/`                | Paginated list: optional `actorId`, `since`, `limit`, `workflowInstanceId`. Response `{ items, nextCursor }`.                                       |
| `GET`  | `/actors/:actorId/messages` | List for one actor; optional `since`, `limit`, `workflowInstanceId`. Response JSON array.                                                           |
| `POST` | `/messages/`                | Create message (internal bearer). Body: `title`, `body`, `actorId`, `actorType`, `workflowInstanceId`, `workflowId`, optional `metadata`, `status`. |

**Actor types:** `user`, `role`, `group`, `system`, `other`.
**Message status (optional):** `active`, `read`.
**`workflowInstanceId` on GET:** When provided, the server validates the n8n execution is in scope before querying (see validations doc).

---

## Action requests

| Method  | Path                                 | Description                                                                                               |
| ------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `GET`   | `/actions`                           | List; optional query `actorId`, `since`, `limit`, `workflowInstanceId`. Response `{ items, nextCursor }`. |
| `GET`   | `/actors/:actorId/actions`           | List for one actor; optional `since`, `limit`, `workflowInstanceId`.                                      |
| `GET`   | `/actions/:actionId`                 | Get by id (scoped by project).                                                                            |
| `GET`   | `/actors/:actorId/actions/:actionId` | Get by id and actor.                                                                                      |
| `POST`  | `/actions`                           | Create (internal bearer). See validations doc for full body fields.                                       |
| `PATCH` | `/actions/:actionId`                 | Body `{ "status": "…" }`.                                                                                 |
| `PATCH` | `/actors/:actorId/actions/:actionId` | Same, scoped by actor.                                                                                    |

**Action status values:** `pending`, `in_progress`, `completed`, `cancelled`, `expired`, `deleted`.
**Priority:** `critical`, `normal`.

---

## Examples

**GET messages with execution filter**

`GET /rest/custom/v1/messages/?workflowInstanceId={{execution_id}}&limit=25`

**POST message (internal)**

```json
{
  "title": "Workflow needs approval",
  "body": "Please review step 3 before continuing.",
  "actorId": "665601d6-0fdd-4dd7-9396-2480b183196a",
  "actorType": "user",
  "workflowInstanceId": "1",
  "workflowId": "WKDGMqR0J2YJZirfB0mzr",
  "status": "active",
  "metadata": { "priority": "high", "source": "n8n" }
}
```

---

## Postman-style variables

`base_url`, `api_key`, `internal_token`, `tenant_id` (UUID), `workflow_id`, `actorId`, execution id for `workflowInstanceId`.

---

## ⚠️ Error handling

Responses use the shared JSON error shape from **`handleErrorResponse`** (`status`, `statusCode`, `message`, optional `stack` in development). For a **status-by-cause** table (400–500) and middleware details, see [`workflow-interaction-api-validations.md`](./workflow-interaction-api-validations.md) § **Error handling**.

Summary:

| HTTP    | Typical cause                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------- |
| **400** | Bad headers (e.g. tenant UUID), Zod validation, bad execution id or workflow mismatch.                    |
| **401** | Invalid/missing API key; internal POST without valid bearer.                                              |
| **403** | Tenant has no mapped project, caller cannot access tenant’s project, or workflow/execution outside scope. |
| **404** | Action request not found (GET/PATCH by id).                                                               |
| **500** | Misconfigured internal token on POST create, DB/n8n failures, or response validation errors.              |
