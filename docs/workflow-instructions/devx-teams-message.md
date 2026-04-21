# DevX Teams Message

Use `Webhook` together with `DevX Message Connector` to receive an incoming payload in n8n and send a Microsoft Teams message through the DevX Connector API.

## What This Node Supports

The `DevX Message Connector` node has three message types:

| Type       | When to use it                                                   | Extra options               |
| ---------- | ---------------------------------------------------------------- | --------------------------- |
| `Template` | Transform a known webhook payload into a supported DevX template | `Source`, `Payload`, `Mode` |
| `Text`     | Send plain text directly to Teams                                | `Text`, `Mode`              |
| `HTML`     | Send sanitized HTML directly to Teams                            | `Html`, `Mode`              |

When `Type` is set to `Template`, these `Source` values are available:

| Source             | Expected payload                                                   |
| ------------------ | ------------------------------------------------------------------ |
| `Rocket.Chat`      | Rocket.Chat message payload with `text` and optional `attachments` |
| `GitHub`           | GitHub `pull_request` or `workflow_run` webhook payload            |
| `Backup Container` | Backup Container webhook payload                                   |
| `Sysdig`           | Sysdig alert webhook payload                                       |
| `Status Cake`      | StatusCake webhook payload                                         |
| `Uptime.com`       | Uptime.com alert webhook payload                                   |
| `Generic`          | A simple custom payload you shape yourself                         |

The `Mode` field is available for all types:

| Mode      | Behavior                                               |
| --------- | ------------------------------------------------------ |
| `Send`    | Sends the message to the configured Teams channel      |
| `Preview` | Calls the preview endpoint instead of posting to Teams |

## Before You Start

Prepare these items first:

1. Access to n8n.
2. A Microsoft Teams channel where the message should be delivered.
3. The full Teams channel link from `Copy link to channel`.
4. A payload source, such as GitHub, Sysdig, StatusCake, Uptime.com, Rocket.Chat, or another webhook sender.

## Create The Workflow

1. Log in to n8n.
2. Click `Create workflow`.

   ![Create workflow button](https://github.com/user-attachments/assets/2c732a04-2b02-4380-9529-d867decbdeaa)

3. Add a `Webhook` node.

   ![Add Webhook node](https://github.com/user-attachments/assets/74289751-88a1-4ccf-9769-061909dbb94d)

4. In the `Webhook` node, set `HTTP Method` to `POST`.
5. Connect the `Webhook` node to a new `DevX Message Connector` node.

   ![Connect Webhook to another node](https://github.com/user-attachments/assets/b0e62aa6-e34c-418e-bc78-f0ecc5f77b1f)

6. Search for `DevX Message Connector` and add it.

   ![Search for DevX Message Connector](https://github.com/user-attachments/assets/c44d48e9-65c0-4584-bbd5-4913580cf356)

## Configure Credentials

1. In the `DevX Message Connector` node, click `Set up credential`.

   ![Set up credential](https://github.com/user-attachments/assets/2b915053-c7db-443b-b17c-4f8170fa350f)

2. In `Teams Channel Link`, paste the full value copied from Microsoft Teams `Copy link to channel`.

   Do not paste only the channel ID. The node parses the full Teams link to extract both the group ID and channel ID.

   ![Copy link to channel in Microsoft Teams](https://github.com/user-attachments/assets/bcd134ec-2d8f-4371-9b3a-9188491741e4)
   ![Teams menu showing Copy link option](https://github.com/user-attachments/assets/537d2250-25d4-4dda-8c3c-d326506bbd20)

3. Save the credential.

## Configure The DevX Message Connector Node

### Template Mode

Use this when the incoming webhook already follows one of the supported payload formats.

1. Set `Type` to `Template`.
2. Set `Source` to the system sending the webhook.
3. Set `Payload` to an expression from the `Webhook` node, usually `{{ $json.body }}`.
4. Set `Mode`:
   `Send` to post to Teams, or `Preview` to inspect the transformed message first.

   ![Template payload expression example](https://github.com/user-attachments/assets/654b1db1-1466-4b16-99dc-e79a2bf33a8b)

### Text Mode

Use this when you want to send a plain text message without a template.

1. Set `Type` to `Text`.
2. Enter the message in `Text`, or use an expression such as `{{ $json.body }}` or `{{ $json.body.message }}`.
3. Set `Mode` to `Send` or `Preview`.

   ![Text payload example](https://github.com/user-attachments/assets/947d7637-7824-498e-b471-5b8b5edc8728)

### HTML Mode

Use this when you want to send HTML directly.

1. Set `Type` to `HTML`.
2. Enter the markup in `Html`, or use an expression from the previous node.
3. Set `Mode` to `Send` or `Preview`.

The node sanitizes HTML before sending it. Common tags such as headings, paragraphs,\ lists, links, tables, code blocks, and images are allowed, but unsupported tags and attributes are removed.

![HTML payload example](https://github.com/user-attachments/assets/b7e498d4-d905-4569-9de7-47a945d7cbcf)

## Supported Input Payloads

This section focuses on the input structures you may provide yourself from your backend service or directly in the n8n node.

### Text

`Type: Text` expects a single string value.

You can either:

1. Enter a constant value directly in the `Text` field.
2. Map a string field from the incoming webhook payload.

Example constant value entered directly in the node:

```text
Deployment completed successfully.
```

Example webhook body from your backend service:

```json
{
  "message": "Deployment completed successfully."
}
```

Recommended expression:

```text
{{ $json.body.message }}
```

If you pass an object instead of a string, the node converts it to JSON text before sending.

### HTML

`Type: HTML` expects a single HTML string.

You can either:

1. Enter constant HTML directly in the `Html` field.
2. Map an HTML string from the incoming webhook payload.

Example constant value entered directly in the node:

```html
<div>
  <strong>Deployment completed</strong>
  <p>The production release is now live.</p>
</div>
```

Example webhook body from your backend service:

```json
{
  "html": "<div><strong>Deployment completed</strong><p>The production release is now live.</p></div>"
}
```

Recommended expression:

```text
{{ $json.body.html }}
```

The node sanitizes the HTML before sending it to Teams.

### Template - Rocket.Chat

Use `Type: Template` and `Source: Rocket.Chat` when your service sends a Rocket.Chat-style payload.

Expected shape:

```json
{
  "text": "Deployment completed",
  "attachments": [
    {
      "title": "my-app",
      "title_link": "https://example.com",
      "text": "Version 1.2.3 is now live",
      "color": "#36a64f",
      "fields": [
        {
          "title": "Environment",
          "value": "prod",
          "short": true
        }
      ]
    }
  ]
}
```

Notes:

1. `text` is the main message body.
2. `attachments` is optional.
3. For each attachment, `title`, `text`, `title_link`, `color`, `image_url`, `thumb_url`, and `fields` are supported.
4. Each entry in `fields` should contain `title`, `value`, and `short`.

You can send this payload from your backend service as JSON and usually map it with:

```text
{{ $json.body }}
```

### Template - Generic

Use `Type: Template` and `Source: Generic` when you want to build a simple custom template from your own service.

Expected shape:

```json
{
  "title": "Service degraded",
  "body": "The API error rate is above threshold.",
  "severity": "warning",
  "url": "https://example.com/incidents/123",
  "urlLabel": "Open incident",
  "source": "custom-monitor"
}
```

Field rules:

1. `title` is required.
2. `body` is optional.
3. `severity` is optional and must be one of `critical`, `warning`, `info`, or `success`.
4. `url` is optional and must be a valid URL if provided.
5. `urlLabel` is optional.
6. `source` is optional.

You can send this payload from your backend service as JSON and usually map it with:

```text
{{ $json.body }}
```

### Other Template Sources

The remaining template sources are designed to receive webhook payloads directly from their designated third-party services. In normal usage, you do not need to handcraft or memorize their payload structures.

### GitHub

Supported webhook types:

1. `pull_request`
2. `workflow_run`

For these events, the node extracts key fields and builds a DevX template message. If you connect GitHub webhooks to n8n, use the incoming request body directly, usually with `{{ $json.body }}`.

### Backup Container

This source is intended for Backup Container webhook payloads. If you connect it through n8n, use the incoming request body directly, usually with `{{ $json.body }}`.

### Sysdig

This source is intended for Sysdig alert webhook payloads. If you connect it through n8n, use the incoming request body directly, usually with `{{ $json.body }}`.

### Uptime.com

This source is intended for Uptime.com alert webhook payloads. If you connect it through n8n, use the incoming request body directly, usually with `{{ $json.body }}`.

### Status Cake

This source is intended for StatusCake webhook payloads. If you connect it through n8n, use the incoming request body directly, usually with `{{ $json.body }}`.

## Common Payload Expressions

Use the expression that matches the output of your previous node:

1. Entire webhook body object: `{{ $json.body }}`
2. A plain text field: `{{ $json.body.message }}`
3. Prebuilt HTML content: `{{ $json.body.html }}`

If your sender posts JSON to the `Webhook` node, `{{ $json.body }}` is usually the right starting point.

## Test The Workflow

1. Set `Mode` to `Preview` first.
2. Open the `Webhook` node and copy the `Test URL` shown there.
3. Click `Listen for test event` in the `Webhook` node.
4. Send a test `POST` request to the `Test URL`.
5. Confirm the `Webhook` node receives the payload and the `DevX Message Connector` node returns a valid preview response.
6. Change `Mode` to `Send` when the message looks correct.

## Webhook URLs

The `Webhook` node exposes two URLs:

1. `Test URL`
   Use this while building or debugging the workflow. In n8n, open the `Webhook` node and copy the `Test URL`. This URL works while the node is listening for a test event.
2. `Production URL`
   Use this for live integrations. In n8n, open the `Webhook` node and copy the `Production URL`. This URL is intended for real traffic and normally requires the workflow to be activated before it will receive requests.

![Webhook URLs](https://github.com/user-attachments/assets/8ef94556-e76c-4b0d-b63c-9c9ea341441a)

A common rollout flow is:

1. Build and validate the workflow with the `Test URL`.
2. Activate the workflow.
3. Update the external system to send requests to the `Production URL`.

## Troubleshooting

1. `Invalid Microsoft Teams channel link provided`
   The credential does not contain a valid full Teams channel link.
2. No message is generated
   The selected `Type` or `Source` does not match the incoming payload shape.
3. Template parsing fails
   Check that `Payload` points to the correct webhook field and that the JSON structure matches the selected template source.
4. HTML formatting is missing
   The node sanitizes HTML and removes unsupported tags or attributes.
