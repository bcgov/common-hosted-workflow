# API Reference

All endpoints live under `/rest/custom/v1` and require the standard authentication headers described in [Architecture - Authentication Model](./architecture.md#authentication-model).

## Common Headers

| Header          | Required | Description                                  |
| --------------- | -------- | -------------------------------------------- |
| `X-N8N-API-KEY` | Yes      | n8n API key                                  |
| `Authorization` | Yes      | `Bearer <INTERNAL_AUTH_TOKEN>`               |
| `X-TENANT-ID`   | Yes      | Tenant identifier for multi-tenant isolation |
| `Content-Type`  | Yes      | `application/json`                           |
| `Accept`        | Yes      | `application/json`                           |

## Create Action

`POST /rest/custom/v1/actions`

| Field                 | Type   | Required | Description                                       |
| --------------------- | ------ | -------- | ------------------------------------------------- |
| `workflowInstanceId`  | string | Yes      | Current execution ID                              |
| `actorId`             | string | Yes      | Target actor identifier                           |
| `actorType`           | string | Yes      | One of `user`, `group`, `role`, `system`, `other` |
| `actionType`          | string | Yes      | One of `getapproval`, `showform`, `waitonevent`   |
| `actionTitle`         | string | No       | Optional title for the action                     |
| `payload`             | object | Yes      | Action-specific data                              |
| `callbackUrl`         | string | No       | URL to call when action completes                 |
| `callbackMethod`      | string | No       | `POST`, `PUT`, `PATCH`, or `none`                 |
| `callbackPayloadSpec` | object | No       | Template describing expected callback body        |
| `workflowId`          | string | Yes      | Source workflow ID                                |
| `dueDate`             | string | No       | RFC 3339 timestamp                                |
| `priority`            | string | No       | `normal` or `critical`                            |
| `checkIn`             | string | No       | RFC 3339 reminder timestamp                       |
| `metadata`            | object | No       | Arbitrary JSON metadata                           |

## Payload by Action Type

| Action Type   | Payload Shape                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `getapproval` | `{ "html": "<p>Do you want to approve?</p>", "options": ["Yes", "No"] }`                                    |
| `showform`    | `{ "formName": "...", "formId": "...", "formApiKey": "...", "submissionId": "...", "formPreFillData": {} }` |
| `waitonevent` | Free-form JSON, preserving the previous behavior, for example `{ "eventName": "clicked" }`                  |

### getapproval Payload

`getapproval` actions render sanitized HTML followed by one button per option. When a user chooses an option, the UI sends the callback body:

```json
{
  "option": "Yes"
}
```

HTML and at least one option are required for `getapproval`; missing HTML or empty options are rejected by the node before the action is created.

Allowed HTML is intentionally limited. Inline `style` attributes, scripts, event handlers, and data attributes are not allowed. The UI applies controlled styling for common elements such as headings, paragraphs, lists, tables, links, images, blockquotes, and code blocks.

Allowed tags include `h1`-`h6`, `p`, `br`, `ul`, `ol`, `li`, `a`, `strong`, `em`, `b`, `i`, `u`, `s`, `code`, `pre`, `blockquote`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `img`, `span`, `div`, and `hr`.

Allowed attributes include `href`, `target`, `rel`, `src`, `alt`, `width`, `height`, `colspan`, `rowspan`, `class`, and `id`.

#### Example: Consent Table

```json
{
  "html": "<h2>Consent to Share Income Information</h2><p>By selecting <b>Yes</b>, you authorize us to collect and share your income information.</p><table><tr><th colspan=\"2\">Consent Summary</th></tr><tr><td><b>Purpose</b></td><td>Determine eligibility and process your request.</td></tr><tr><td><b>If you choose No</b></td><td>We may not be able to complete your eligibility assessment.</td></tr></table>",
  "options": ["Yes", "No"]
}
```

#### Example: Checklist

```json
{
  "html": "<h3>Review Required</h3><p>Confirm that these checks are complete:</p><ul><li>Identity verified.</li><li>Documents reviewed.</li><li>No duplicate request is active.</li></ul>",
  "options": ["Approve", "Needs Changes", "Reject"]
}
```

For `showform`, `formName`, `formId`, and `formApiKey` are required by the n8n node. `formName` is the CHEFS form name, `formId` is the CHEFS form ID, and `formApiKey` is the CHEFS form API key. `submissionId` is an optional CHEFS form submission ID used to prefill the form from prior submission data. `formPreFillData` is an optional object used to prefill over rendered form data. When `submissionId` is provided, it takes full priority over `formPreFillData`. The backend strips `formApiKey` before returning actions to the browser.

## Other Endpoints

- `GET /rest/custom/v1/actions/:id` returns a single action.
- `GET /rest/custom/v1/actions` lists actions.
- `PATCH /rest/custom/v1/actions/:id` updates action status.
- `GET /rest/custom/v1/actors/:actorId/actions` lists actions for an actor.
- Message endpoints remain under `/messages` and `/actors/:actorId/messages`.
