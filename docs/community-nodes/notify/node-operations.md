# Notify node operations

All paths are relative to the credential **Base URL** (`baseUrl`). Versioned routes live under `/api/v1/...`; health is unversioned at `/api/health`. Every versioned call sends the configured key as `X-API-KEY` plus `Accept: application/json` and `Content-Type: application/json`. Only **Service / Check health** omits the key (the service marks it `@Public()`).

## Operation and endpoint matrix

| Resource                                   | Operation (UI label)       | Serialized operation       | HTTP method and path                                                                 | Auth                                        |
| ------------------------------------------ | -------------------------- | -------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- |
| Send (`send`)                              | Send Notification          | `sendNotification`         | `POST /api/v1/notifysimple` (optional `?preview=true`)                               | `X-API-KEY`                                 |
| Send (`send`)                              | Send Email                 | `sendEmail`                | `POST /api/v1/notifysimple/email` (optional `?preview=true`)                         | `X-API-KEY`                                 |
| Send (`send`)                              | Send SMS                   | `sendSms`                  | `POST /api/v1/notifysimple/sms` (optional `?preview=true`)                           | `X-API-KEY`                                 |
| Send (`send`)                              | Cancel or Reschedule       | `cancelOrReschedule`       | `PATCH /api/v1/notifysimple/{notificationId}`                                        | `X-API-KEY`                                 |
| Notification status (`notificationStatus`) | List Notification Requests | `listNotificationRequests` | `GET /api/v1/notification_request` (`page`/`limit`/`sort`/repeated `filter`)         | `X-API-KEY`                                 |
| Notification status (`notificationStatus`) | List Delivery Records      | `listDeliveryRecords`      | `GET /api/v1/notification_request/request_details`                                   | `X-API-KEY`                                 |
| Notification status (`notificationStatus`) | Get Delivery Records       | `getDeliveryRecords`       | `GET /api/v1/notification_request/{id}/request_details` (`id` from `notificationId`) | `X-API-KEY`                                 |
| Templates (`templates`)                    | List Templates             | `listTemplates`            | `GET /api/v1/templates` (`page`/`limit`/`sort`/repeated `filter`)                    | `X-API-KEY`                                 |
| Templates (`templates`)                    | Create Template            | `createTemplate`           | `POST /api/v1/templates`                                                             | `X-API-KEY` + `NOTIFY_TEMPLATE_EDITOR` role |
| Templates (`templates`)                    | Get Template               | `getTemplate`              | `GET /api/v1/templates/{templateId}`                                                 | `X-API-KEY`                                 |
| Templates (`templates`)                    | Update Template            | `updateTemplate`           | `PATCH /api/v1/templates/{templateId}`                                               | `X-API-KEY` + `NOTIFY_TEMPLATE_EDITOR` role |
| Templates (`templates`)                    | Delete Template            | `deleteTemplate`           | `DELETE /api/v1/templates/{templateId}` (204, no body)                               | `X-API-KEY` + `NOTIFY_TEMPLATE_EDITOR` role |
| Templates (`templates`)                    | Preview Template           | `previewTemplate`          | `POST /api/v1/templates/{templateId}/preview` (body `{ params }`)                    | `X-API-KEY`                                 |
| Webhooks (`webhooks`)                      | Register Callback          | `registerCallback`         | `POST /api/v1/notify/registerCallback` (201, returns `callbackId`)                   | `X-API-KEY`                                 |
| Webhooks (`webhooks`)                      | Update Callback            | `updateCallback`           | `PATCH /api/v1/notify/registerCallback/{callbackId}`                                 | `X-API-KEY`                                 |
| Webhooks (`webhooks`)                      | Delete Callback            | `deleteCallback`           | `DELETE /api/v1/notify/registerCallback/{callbackId}` (204, no body)                 | `X-API-KEY`                                 |
| Service (`service`)                        | Check Health               | `checkHealth`              | `GET /api/health`                                                                    | None (no `X-API-KEY`)                       |

## Inputs per operation

- **Send / Send Notification** (`payload`, JSON, required): full `NotifySimpleRequest` body with at least one of `email`/`sms`/`msgApp`; templateId XOR inline content per channel; channel `params` override top-level `params`. A bare channel (`recipients` at top level) is rejected locally — wrap it or use a shorthand below.
- **Send / Send Email** (`emailPayload`, JSON, required): **bare** email channel (`recipients.to`/`cc`/`bcc` or `recipients.mergeArray` mail merge, `content`, `attachments`, `delayedSend`, `params`, `identityId`) with **no `email` wrapper**. A wrapped `{"email": {...}}` body (the Swagger example for the generic endpoint) is rejected locally — unwrap it or switch to Send Notification.
- **Send / Send SMS** (`smsPayload`, JSON, required): full SMS request with an `sms` channel (`{"sms": {...}, "params": {...}}`); numbers normalise to E.164; `403` when SMS is disabled for the tenant. A bare channel or an `email`/`msgApp` body is rejected locally — the `sms` channel is required.
- **Preview** (`preview`, boolean, default `false`): shown only on the three send POSTs; when enabled appends `?preview=true`, which returns `200` with rendered content without sending. Attachments and `mergeArray` are not supported in preview.
- **Send / Cancel or Reschedule** (`notificationId` required + `action` `cancel`/`reschedule`; `scheduledTime` required and shown only for `reschedule`): cancel sends `{"action":"cancel"}`; reschedule sends `{"scheduledTime":"..."}` with a future time including a timezone (`Z` suffix or numeric offset). Unparsable, past, or timezone-less times are rejected locally. `404`/`422` cases are pass-through upstream errors.
- **Notification status / List Notification Requests** (`page` default `1`, `limit` default `10` max `100`, `sort` e.g. `-createdAt,status`, repeatable `filters` entries in `field:operator:value` format e.g. `status:eq:QUEUED`, sent as repeated `filter` query params with `arrayFormat: repeat`).
- **Notification status / List Delivery Records**: no parameters; returns all delivery records for the tenant.
- **Notification status / Get Delivery Records** (`notificationId`, required): per-recipient records with `channelCode`/`status`/`errorReason`.
- **Templates / List** (`page`/`limit`/`sort`/`filters` as above, e.g. `channelCode:eq:EMAIL`; newest first by default).
- **Templates / Create** (`name` required, unique per tenant; `channelCode` `EMAIL`/`SMS` required; `body` required; `subject` optional locally but required for `EMAIL` — server validates; `engineCode` `handlebars`/`mustache`, defaults to `handlebars` server-side when omitted; `bodyType` `markdown` only; `description` optional).
- **Templates / Get / Delete** (`templateId`, required).
- **Templates / Update** (`templateId` required + optional patch fields; stores a new version, keeping history so already-scheduled notifications are unaffected).
- **Templates / Preview** (`templateId` required + `params` JSON default `'{}'`, sent as `{ params }`; every placeholder the template uses must be supplied).
- **Webhooks / Register** (`url` required, https-only; `channelType` multi-option `email`/`sms`/`msgApp`, at least one; `trigger` multi-option `success`/`failure`, at least one; `secret` password-masked, optional; `headers` JSON object, optional; `active` boolean default `true`; `webhookType` `generic`/`teams`, omitted means generic server-side).
- **Webhooks / Update** (`callbackId` required + same fields, all optional: empty `url`/`secret`/`headers`/`webhookType` omitted, empty `channelType`/`trigger` left unchanged, `active` always sent — confirm its value when changing other fields).
- **Webhooks / Delete** (`callbackId` only; 204 with no body).

## Send payload examples (copy-paste shapes)

**Send / Send Notification** — full request, channel wrapped, top-level `params`:

```json
{
  "email": {
    "recipients": { "to": ["citizen@example.com"] },
    "content": {
      "subject": "Your permit application",
      "body": "# Hello {{firstName}}\n\nYour application has been received.",
      "bodyType": "markdown",
      "renderer": "handlebars"
    }
  },
  "params": { "firstName": "Alice" }
}
```

**Send / Send Email** — bare channel, no `email` wrapper (a wrapped `{"email": {...}}` body belongs to Send Notification):

```json
{
  "recipients": { "to": ["citizen@example.com"] },
  "content": {
    "subject": "Your permit application",
    "body": "# Hello {{firstName}}\n\nYour application has been received.",
    "bodyType": "markdown",
    "renderer": "handlebars"
  },
  "params": { "firstName": "Alice" }
}
```

**Send / Send SMS** — full request with an `sms` channel (unlike email, the SMS route takes the wrapped shape):

```json
{
  "sms": {
    "recipients": { "to": ["+12505550123"] },
    "content": { "body": "Your appointment is confirmed for 09:00 tomorrow." }
  },
  "params": {}
}
```

## Visibility rules (identifiers only where used)

- `notificationId` is shown/required only on **Send / Cancel or Reschedule** and **Notification status / Get Delivery Records**; list operations never read it.
- `templateId` is shown/required only on template get/update/delete/preview; list and create never read it.
- `callbackId` is shown/required only on webhook update/delete; register never reads it; delete reads no other webhook fields.
- `scheduledTime` appears only when `action` is `reschedule`.
- `page`/`limit`/`sort`/`filters` appear only on the two list operations (`listNotificationRequests`, `listTemplates`).

## Follow-up, roles, and webhook verification

- **Async delivery:** sends return `202` with `notifyId` (accepted, not delivered). Correlate via Notification status: the send `notifyId` appears as `id` (and `notificationRequestId` on delivery records) there.
- **Template roles:** create/update/delete require the `NOTIFY_TEMPLATE_EDITOR` role on the API key (`403` otherwise); the node surfaces this as an upstream error and documents it rather than pre-validating roles.
- **SMS guard:** SMS sends return `403` when the tenant lacks SMS; surfaced as an upstream error.
- **Webhooks:** URLs must be https (plain http rejected locally). Deliveries retry with backoff; when `secret` is set each delivery carries an HMAC `X-Webhook-Signature` header for verification.

## Responses and errors

- Local validation (blank `notificationId`/`templateId`/`callbackId`/`url`, missing `scheduledTime` on reschedule, unparsable/past/timezone-less `scheduledTime`, bad channel/engine/body enums, non-https URLs, invalid JSON bodies, wrong-shape send bodies — bare channel on generic, wrapped full request on Send Email, non-`sms` body on Send SMS — channel-less generic payloads, recipient-less email payloads, empty template patches) fails before transport without mutating the request. Error messages name the field label, never the supplied secret value; API keys and webhook secrets never appear in errors.
- Upstream errors (template/safelist `422`, SMS-disabled `403`, missing-editor-role `403`, unknown-id `404`) pass through with n8n's normal error settings. Continue On Fail pairing behavior applies to transport failures.

See [credentials](./credentials.md) and [release notes](./release-notes.md).
