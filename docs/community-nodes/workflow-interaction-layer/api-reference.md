# API Reference

All endpoints live under `/rest/custom/v1` and require the standard authentication headers described in [Architecture — Authentication Model](./architecture.md#authentication-model).

## Common Headers (All Requests)

| Header          | Required | Description                                  |
| --------------- | -------- | -------------------------------------------- |
| `X-N8N-API-KEY` | Yes      | n8n API key                                  |
| `Authorization` | Yes      | `Bearer <INTERNAL_AUTH_TOKEN>`               |
| `X-TENANT-ID`   | Yes      | Tenant identifier for multi-tenant isolation |
| `Content-Type`  | Yes      | `application/json`                           |
| `Accept`        | Yes      | `application/json`                           |

The `workflowId` is included in the request body on create operations, not as a header.

---

## Message Endpoints

### Create Message

```
POST /rest/custom/v1/messages
```

**Request Body:**

| Field                | Type   | Required | Description                                        |
| -------------------- | ------ | -------- | -------------------------------------------------- |
| `workflowInstanceId` | string | Yes      | Current execution ID                               |
| `actorId`            | string | Yes      | Target actor identifier (max 50 chars)             |
| `actorType`          | string | Yes      | One of: `user`, `group`, `role`, `system`, `other` |
| `title`              | string | Yes      | Message title (max 255 chars)                      |
| `body`               | string | Yes      | Message body text                                  |
| `workflowId`         | string | Yes      | Source workflow ID                                 |
| `metadata`           | object | No       | Arbitrary JSON metadata                            |

**Response (201):**

```json
{
  "id": "msg-1",
  "workflowInstanceId": "exec-1001",
  "actorId": "alice@example.com",
  "actorType": "user",
  "title": "Application Submitted",
  "body": "Your application has been submitted.",
  "workflowId": "wf-demo-1",
  "projectId": "project-for-wf-demo-1",
  "tenantId": "tenant-demo",
  "status": "active",
  "metadata": { "formId": "intake" },
  "createdAt": "2026-03-26T00:00:00.000Z",
  "updatedAt": "2026-03-26T00:00:00.000Z"
}
```

### Read Message

```
GET /rest/custom/v1/messages/:id
```

This endpoint exists in the API but is not exposed as a node operation. Use the List Messages or Get Messages by Actor ID operations instead.

### List Messages

```
GET /rest/custom/v1/messages
```

**Query Parameters:**

| Parameter            | Type   | Default | Description                                                 |
| -------------------- | ------ | ------- | ----------------------------------------------------------- |
| `actorId`            | string | —       | Filter by actor ID                                          |
| `workflowInstanceId` | string | —       | Filter by execution ID                                      |
| `since`              | string | —       | RFC 3339 timestamp; return messages created after this time |
| `limit`              | number | `50`    | Max results per page (1–200)                                |

**Response (200):** Array of message objects.

### Get Messages by Actor ID

```
GET /rest/custom/v1/actors/:actorId/messages
```

Returns all messages for a specific actor within the caller's project and tenant.

**Query Parameters:**

| Parameter            | Type   | Default | Description                                                 |
| -------------------- | ------ | ------- | ----------------------------------------------------------- |
| `since`              | string | —       | RFC 3339 timestamp; return messages created after this time |
| `limit`              | number | `50`    | Max results per page (1–200)                                |
| `workflowInstanceId` | string | —       | Filter by execution ID                                      |

**Response (200):** Array of message objects.

---

## Action Endpoints

### Create Action

```
POST /rest/custom/v1/actions
```

**Request Body:**

| Field                 | Type   | Required | Description                                        |
| --------------------- | ------ | -------- | -------------------------------------------------- |
| `workflowInstanceId`  | string | Yes      | Current execution ID                               |
| `actorId`             | string | Yes      | Target actor identifier (max 50 chars)             |
| `actorType`           | string | Yes      | One of: `user`, `group`, `role`, `system`, `other` |
| `actionType`          | string | Yes      | One of: `getapproval`, `showform`, `waitonevent`   |
| `payload`             | object | Yes      | Action-specific data (see below)                   |
| `callbackUrl`         | string | Yes      | URL to call when action completes                  |
| `callbackMethod`      | string | No       | `POST` (default), `PUT`, or `PATCH`                |
| `callbackPayloadSpec` | object | No       | Template describing expected callback body         |
| `workflowId`          | string | Yes      | Source workflow ID                                 |
| `dueDate`             | string | No       | RFC 3339 timestamp                                 |
| `priority`            | string | No       | `normal` (default) or `critical`                   |
| `checkIn`             | string | No       | RFC 3339 reminder timestamp                        |
| `metadata`            | object | No       | Arbitrary JSON metadata                            |

**Payload by Action Type:**

| Action Type   | Recommended Payload Fields                      |
| ------------- | ----------------------------------------------- |
| `getapproval` | Free-form JSON (e.g. `{ "applicationId": 42 }`) |
| `showform`    | `formId`, `formVersion`, `returnUrl`            |
| `waitonevent` | `eventName`                                     |

**Response (201):**

```json
{
  "id": "act-1",
  "workflowInstanceId": "exec-1001",
  "actorId": "bob@example.com",
  "actorType": "user",
  "actionType": "getapproval",
  "payload": { "applicationId": 42 },
  "callbackUrl": "http://localhost:5678/webhook/approval-callback",
  "callbackMethod": "POST",
  "callbackPayloadSpec": { "approved": "boolean", "comments": "string" },
  "workflowId": "wf-demo-1",
  "projectId": "project-for-wf-demo-1",
  "tenantId": "tenant-demo",
  "status": "pending",
  "priority": "normal",
  "dueDate": "2026-04-01T00:00:00Z",
  "checkIn": null,
  "metadata": null,
  "createdAt": "2026-03-26T00:00:00.000Z",
  "updatedAt": "2026-03-26T00:00:00.000Z"
}
```

### Get Action

```
GET /rest/custom/v1/actions/:id
```

**Response (200):** Single action object.

**Response (404):** `{ "error": "Action not found" }`

### List Actions

```
GET /rest/custom/v1/actions
```

**Query Parameters:**

| Parameter            | Type   | Default | Description                                                |
| -------------------- | ------ | ------- | ---------------------------------------------------------- |
| `actorId`            | string | —       | Filter by actor ID                                         |
| `workflowInstanceId` | string | —       | Filter by execution ID                                     |
| `since`              | string | —       | RFC 3339 timestamp; return actions created after this time |
| `limit`              | number | `50`    | Max results per page (1–200)                               |

**Response (200):** Array of action objects.

### Update Action

```
PATCH /rest/custom/v1/actions/:id
```

**Request Body:**

| Field    | Type   | Required | Description                                                                          |
| -------- | ------ | -------- | ------------------------------------------------------------------------------------ |
| `status` | string | Yes      | New status: `pending`, `in_progress`, `completed`, `cancelled`, `expired`, `deleted` |

**Response (200):**

```json
{
  "status": "completed",
  "message": "Action status updated to completed"
}
```

> **Note:** To delete an action, send a PATCH with `{ "status": "deleted" }`.

### Get Actions by Actor ID

```
GET /rest/custom/v1/actors/:actorId/actions
```

Returns all actions for a specific actor within the caller's project and tenant.

**Query Parameters:**

| Parameter            | Type   | Default | Description                                                |
| -------------------- | ------ | ------- | ---------------------------------------------------------- |
| `since`              | string | —       | RFC 3339 timestamp; return actions created after this time |
| `limit`              | number | `50`    | Max results per page (1–200)                               |
| `workflowInstanceId` | string | —       | Filter by execution ID                                     |
