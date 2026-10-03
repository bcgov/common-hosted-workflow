# Notify release notes

## Initial release

First release of the Notify node (`notify`, version `1`) with the **Notify API** credential (`notifyApi`), covering all 17 Notify service endpoints: 4 Send, 3 Notification-status, 6 Templates, 3 Webhooks, and 1 Service health check. There is no prior version and no migration.

### Serialized identifiers (stable)

- Node `name: notify`, version `1`; credential `notifyApi` with properties `baseUrl`, `apiKey`.
- Resources: `send`, `notificationStatus`, `templates`, `webhooks`, `service`.
- Operations: `sendNotification`, `sendEmail`, `sendSms`, `cancelOrReschedule`, `listNotificationRequests`, `listDeliveryRecords`, `getDeliveryRecords`, `listTemplates`, `createTemplate`, `getTemplate`, `updateTemplate`, `deleteTemplate`, `previewTemplate`, `registerCallback`, `updateCallback`, `deleteCallback`, `checkHealth`.
- Parameter names (`payload`, `emailPayload`, `smsPayload`, `preview`, `notificationId`, `action`, `scheduledTime`, `page`, `limit`, `sort`, `filters`, `templateId`, `name`, `channelCode`, `subject`, `body`, `engineCode`, `bodyType`, `description`, `params`, `callbackId`, `url`, `secret`, `headers`, `channelType`, `trigger`, `active`, `webhookType`) and manifest entries (`dist/nodes/Notify/Notify.node.js`, `dist/credentials/NotifyApi.credentials.js`) are preserved. Node metadata identifier `n8n-nodes-notify` is preserved.

### Async 202 semantics

Sends return `202 Accepted` with a `notifyId`: the notification was accepted, not delivered. Preview requests with `?preview=true` return `200` with rendered content and send nothing. Correlate delivery via Notification-status operations (send `notifyId` appears as `id` / `notificationRequestId`).

### Role and capability notes

- Template create/update/delete require the `NOTIFY_TEMPLATE_EDITOR` role on the API key (`403` otherwise); template validation (e.g. `subject` required for `EMAIL`) and SMS-disabled `403`s are server-side and surface as pass-through upstream errors.
- Webhook callbacks require https URLs and support `email`/`sms`/`msgApp` channels with `success`/`failure` triggers; deliveries retry with backoff and carry HMAC `X-Webhook-Signature` when a secret is set.
- Health (`GET /api/health`) is unversioned and public — no `X-API-KEY` is sent.

See the [overview](./README.md), [node operations](./node-operations.md), and [credentials](./credentials.md).
