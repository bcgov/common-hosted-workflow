# Notify

The Notify node sends email/SMS notifications, looks up delivery status, manages templates, registers delivery webhooks, and probes service health through the Notify service API. It is a version 1 declarative n8n node (`notify`) using the **Notify API** credential (`notifyApi`).

## Quick start

1. Obtain the Notify base URL for your environment (gateway URL) and an API key (`X-API-KEY`).
2. Create a **Notify API** credential with that base URL and API key.
3. Add **Notify** to the workflow and select the credential.
4. Choose a resource and operation. Sends return `202 Accepted` with a `notifyId` when accepted — `202` means accepted, not delivered.
5. Follow up with **Notification status** operations: the send response `notifyId` appears as `id` in status results.

Sends are asynchronous. Use `?preview=true` (the **Preview** toggle on the three send POSTs) to render content without sending, or **Templates / Preview** to render a template with sample params. Template create/update/delete require the `NOTIFY_TEMPLATE_EDITOR` role on the API key. **Service / Check health** (`GET /api/health`) needs no authentication and sends no `X-API-KEY`, but still requires the credential **Base URL** to build `<baseUrl>/api/health`.

## Guides

- [Node operations and input matrix](./node-operations.md)
- [Credential setup](./credentials.md)
- [Release notes](./release-notes.md)

Serialized identifiers are stable: node name `notify` (version `1`), credential `notifyApi`, resource values `send` / `notificationStatus` / `templates` / `webhooks` / `service`, and the operation values listed in [node operations](./node-operations.md).
