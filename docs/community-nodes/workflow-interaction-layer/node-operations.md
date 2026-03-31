# Node Operations

This document describes every resource and operation available in the Workflow Interaction Layer node as seen in the n8n UI.

## Auto-Populated Fields

The node automatically injects two fields on every create operation — you do not need to set them:

| Field                | Source                  | Description                                 |
| -------------------- | ----------------------- | ------------------------------------------- |
| `workflowId`         | `this.getWorkflow().id` | The ID of the workflow containing this node |
| `workflowInstanceId` | `this.getExecutionId()` | The current execution ID                    |

A notice banner in the UI reminds users of this behavior.

---

## Resource: Message

### Create

Creates a new message in the WIL-API Layer.

| Parameter  | Type               | Required | Default | Description                                |
| ---------- | ------------------ | -------- | ------- | ------------------------------------------ |
| Actor ID   | string             | Yes      | —       | Target actor identifier (max 50 chars)     |
| Actor Type | options            | Yes      | `user`  | `user`, `group`, `role`, `system`, `other` |
| Title      | string             | Yes      | —       | Message title (max 255 chars)              |
| Body       | string (multiline) | Yes      | —       | Message body text                          |
| Metadata   | JSON               | No       | `{}`    | Arbitrary JSON metadata                    |

### Get Many

Lists messages with optional filters and pagination.

| Parameter            | Type    | Required | Default | Description                                                                         |
| -------------------- | ------- | -------- | ------- | ----------------------------------------------------------------------------------- |
| Return All           | boolean | No       | `false` | Whether to return all results                                                       |
| Limit                | number  | No       | `50`    | Max results (1–200, shown when Return All is false)                                 |
| Actor ID             | string  | No       | —       | Filter by actor ID                                                                  |
| Workflow Instance ID | string  | No       | —       | Filter by execution ID                                                              |
| Since                | string  | No       | —       | RFC 3339 timestamp; return messages created after this time (cursor for pagination) |

### Get Messages by Actor ID

Returns all messages for a specific actor.

| Parameter            | Type   | Required | Default | Description                                                 |
| -------------------- | ------ | -------- | ------- | ----------------------------------------------------------- |
| Actor ID             | string | Yes      | —       | Actor to retrieve messages for                              |
| Since                | string | No       | —       | RFC 3339 timestamp; return messages created after this time |
| Limit                | number | No       | `50`    | Max results (1–200)                                         |
| Workflow Instance ID | string | No       | —       | Filter by execution ID                                      |

---

## Resource: Action

### Create

Creates a new action in the WIL-API Layer.

| Parameter             | Type    | Required | Default       | Description                                |
| --------------------- | ------- | -------- | ------------- | ------------------------------------------ |
| Actor ID              | string  | Yes      | —             | Target actor identifier (max 50 chars)     |
| Actor Type            | options | Yes      | `user`        | `user`, `group`, `role`, `system`, `other` |
| Action Type           | options | Yes      | `getapproval` | `getapproval`, `showform`, `waitonevent`   |
| Payload               | JSON    | Yes      | `{}`          | Action-specific data                       |
| Callback URL          | string  | Yes      | —             | URL called when action completes           |
| Callback Method       | options | No       | `POST`        | `POST`, `PUT`, `PATCH`                     |
| Callback Payload Spec | JSON    | No       | `{}`          | Template for expected callback body        |
| Due Date              | string  | No       | —             | RFC 3339 timestamp                         |
| Priority              | options | No       | `normal`      | `normal` or `critical`                     |
| Check In              | string  | No       | —             | RFC 3339 reminder timestamp                |
| Metadata              | JSON    | No       | `{}`          | Arbitrary JSON metadata                    |

**Action Type Guidance:**

- `getapproval` — Use when a human needs to approve or reject something. The `payload` is free-form (e.g. `{ "applicationId": 42, "applicant": "alice@example.com" }`).
- `showform` — Use when a user needs to fill out a form. Include `formId`, `formVersion`, and `returnUrl` in the payload.
- `waitonevent` — Use when the workflow should pause until an external event occurs. Include `eventName` in the payload.

### Get

Retrieves a single action by its ID.

| Parameter | Type   | Required | Description                  |
| --------- | ------ | -------- | ---------------------------- |
| Action ID | string | Yes      | ID of the action to retrieve |

### Get Many

Lists actions with optional filters and pagination.

| Parameter            | Type    | Required | Default | Description                                                |
| -------------------- | ------- | -------- | ------- | ---------------------------------------------------------- |
| Return All           | boolean | No       | `false` | Whether to return all results                              |
| Limit                | number  | No       | `50`    | Max results (1–200, shown when Return All is false)        |
| Actor ID             | string  | No       | —       | Filter by actor ID                                         |
| Workflow Instance ID | string  | No       | —       | Filter by execution ID                                     |
| Since                | string  | No       | —       | RFC 3339 timestamp; return actions created after this time |

### Update

Updates the status of an existing action. Only the `status` field is accepted by the API.

| Parameter | Type    | Required | Default   | Description                                                              |
| --------- | ------- | -------- | --------- | ------------------------------------------------------------------------ |
| Action ID | string  | Yes      | —         | ID of the action to update                                               |
| Status    | options | Yes      | `pending` | `pending`, `in_progress`, `completed`, `cancelled`, `expired`, `deleted` |

> **Note:** To delete an action, use the Update operation with status set to `deleted`.

### Get Actions by Actor ID

Returns all actions for a specific actor.

| Parameter            | Type   | Required | Default | Description                                                |
| -------------------- | ------ | -------- | ------- | ---------------------------------------------------------- |
| Actor ID             | string | Yes      | —       | Actor to retrieve actions for                              |
| Since                | string | No       | —       | RFC 3339 timestamp; return actions created after this time |
| Limit                | number | No       | `50`    | Max results (1–200)                                        |
| Workflow Instance ID | string | No       | —       | Filter by execution ID                                     |
