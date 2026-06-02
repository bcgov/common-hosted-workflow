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

| Parameter             | Type    | Required                          | Default       | Description                                                        |
| --------------------- | ------- | --------------------------------- | ------------- | ------------------------------------------------------------------ |
| Actor ID              | string  | Yes                               | —             | Target actor identifier (max 50 chars)                             |
| Actor Type            | options | Yes                               | `user`        | `user`, `group`, `role`, `system`, `other`                         |
| Action Type           | options | Yes                               | `getapproval` | `getapproval`, `showform`, `waitonevent`                           |
| Payload               | JSON    | Yes                               | `{}`          | Action-specific data                                               |
| Callback Method       | options | No                                | `POST`        | `none`, `POST`, `PUT`, `PATCH`                                     |
| Callback URL          | string  | Yes (when Callback Method ≠ None) | —             | URL called when action completes. Hidden when method is "None".    |
| Callback Payload Spec | JSON    | No                                | `{}`          | Template for expected callback body. Hidden when method is "None". |
| Due Date              | string  | No                                | —             | RFC 3339 timestamp                                                 |
| Priority              | options | No                                | `normal`      | `normal` or `critical`                                             |
| Check In              | string  | No                                | —             | RFC 3339 reminder timestamp                                        |
| Metadata              | JSON    | No                                | `{}`          | Arbitrary JSON metadata                                            |

**Callback Method Behavior:**

- **None** — No callback will be issued when the action completes. The Callback URL and Callback Payload Spec fields are hidden from the UI and omitted from the API request.
- **POST / PUT / PATCH** — The specified HTTP method is used to call the Callback URL upon action completion. The Callback URL field becomes required.

**Action Type Guidance:**

- `getapproval` — Use when a human needs to approve or reject something. The `payload` is free-form (e.g. `{ "applicationId": 42, "applicant": "alice@example.com" }`).
- `showform` — Use when a user needs to fill out a form. See the **showform Payload Reference** section below for all supported fields.
- `waitonevent` — Use when the workflow should pause until an external event occurs. Include `eventName` in the payload.

#### showform Payload Reference

When `actionType` is `showform`, the `payload` JSON object supports the following fields:

| Field                                   | Type   | Required | Description                                                                                                                                                                   |
| --------------------------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formId` / `FormID`                     | string | Yes      | The CHEFS form UUID to render                                                                                                                                                 |
| `FormName` / `formName`                 | string | No       | Display name shown to the user in the action card                                                                                                                             |
| `FormAPIKey` / `formApiKey`             | string | Yes      | CHEFS API key used server-side to obtain a short-lived JWT. **Never exposed to the browser** — the SDG backend strips it before returning actions to the frontend.            |
| `FormPreFillData` / `formPreFillData`   | object | No       | Key-value pairs matching CHEFS form field API names. When present, the form opens with these fields pre-populated. See [Pre-Filling Form Data](#pre-filling-form-data) below. |
| `FormSubmissionId` / `formSubmissionId` | string | No       | An existing CHEFS submission ID. When provided, the form loads that submission for editing instead of rendering a blank form. Takes precedence over `FormPreFillData`.        |
| `formVersion`                           | string | No       | CHEFS form version to render (optional)                                                                                                                                       |
| `returnUrl`                             | string | No       | URL to redirect to after submission (optional, not currently used by the SDG mock app)                                                                                        |

> Both PascalCase (`FormPreFillData`) and camelCase (`formPreFillData`) are accepted. The frontend checks both casings.

#### Pre-Filling Form Data

`FormPreFillData` allows a workflow to pre-populate CHEFS form fields when presenting a `showform` action to a user. This is useful when the workflow already has data (from a previous form submission, a database lookup, or computed values) that should appear as defaults in the form.

**How it works:**

1. The n8n workflow creates a `showform` action with `FormPreFillData` in the payload.
2. The SDG frontend receives the action (with `FormAPIKey` stripped) and extracts `FormPreFillData`.
3. When the user clicks "Fill Form", the frontend opens the CHEFS form viewer.
4. Once the `<chefs-form-viewer>` web component fires its `formio:ready` event, the frontend calls `setSubmission(prefillData)` on the web component to inject the values.
5. The user sees the form with fields already filled in and can modify or submit as-is.

**Example payload:**

```json
{
  "formId": "abc123-def456-ghi789",
  "FormName": "Employee Onboarding",
  "FormAPIKey": "<your-form-api-key>",
  "FormPreFillData": {
    "firstName": "Alice",
    "lastName": "Smith",
    "department": "Engineering",
    "startDate": "2026-06-01"
  }
}
```

**Important notes:**

- The keys in `FormPreFillData` must match the CHEFS form field **API names** (the `key` property in the form.io schema), not the display labels.
- If `FormSubmissionId` is also present, it takes precedence — the form loads the existing submission and `FormPreFillData` is ignored.
- `FormPreFillData` is not sensitive and is passed through to the browser (unlike `FormAPIKey` which is stripped).

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
