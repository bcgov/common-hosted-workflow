# Multi Webhook Wait Node

## Overview

The **Multi Webhook Wait Node** pauses a workflow execution and waits for multiple independent webhook callbacks before resuming. Each expected callback is defined by a query parameter and value pair. The workflow only continues once all expected callbacks have been received.

This is useful for human-in-the-loop (HITL) approval workflows where multiple actors must independently approve or respond before the workflow can proceed.

## How It Works

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Upstream    │────▶│  Multi Webhook Wait  │────▶│  Downstream     │
│  Nodes       │     │  (pauses execution)  │     │  Nodes          │
└─────────────┘     └──────────────────────┘     └─────────────────┘
                              │
                              │ Generates callback URLs
                              ▼
                    ┌──────────────────────┐
                    │  External Systems    │
                    │  call back one by    │
                    │  one (any order)     │
                    └──────────────────────┘
```

1. The node receives input data from upstream nodes.
2. It generates unique callback URLs for each expected call (based on the resume URL + query parameters).
3. The execution is paused (`putExecutionToWait`).
4. External systems call back to the generated URLs independently, in any order.
5. Each callback is acknowledged with a JSON response indicating progress.
6. Once all expected callbacks have been received, the workflow resumes and passes the aggregated callback data downstream.

## Node Parameters

| Parameter              | Type               | Default | Description                                                                  |
| ---------------------- | ------------------ | ------- | ---------------------------------------------------------------------------- |
| Expected Calls         | Fixed Collection   | —       | List of expected callbacks. Each entry has a `queryParam` and `queryValue`.  |
| Webhook Method         | Options (GET/POST) | POST    | HTTP method the callbacks will use.                                          |
| Timeout (Minutes)      | Number             | 0       | How long to wait before timing out. 0 = wait indefinitely.                   |
| Notify External System | Boolean            | false   | Whether to POST callback URLs to an external system.                         |
| Notify URL             | String             | —       | URL to POST the callback URLs to (shown when notify is enabled).             |
| Additional Data        | JSON               | `{}`    | Extra payload to include in the notification (shown when notify is enabled). |

### Expected Calls Configuration

Each expected call is defined by:

- **Query Parameter**: The name of the query parameter that identifies this callback (e.g. `actor`, `approver`, `step`).
- **Query Value**: The specific value that must match for this callback to be recognized (e.g. `amina`, `gokul`, `finance-team`).

You can add as many expected calls as needed using the "Add Expected Call" button.

## Generated Callback URLs

The node generates one callback URL per expected call. The format is:

```
http://<n8n-host>/webhook-waiting/<executionId>?signature=<token>&<queryParam>=<queryValue>
```

For example, with two expected calls (`actor=amina` and `actor=gokul`):

```
http://localhost:5678/webhook-waiting/194?signature=abc123...&actor=amina
http://localhost:5678/webhook-waiting/194?signature=abc123...&actor=gokul
```

These URLs are available in the workflow's input data (via the upstream nodes that build them) or can be sent to an external system using the notify feature.

## Callback Matching Logic

When a webhook call arrives, the node:

1. Extracts the query parameters from the incoming request.
2. Compares them against the list of expected calls.
3. If a match is found (e.g. `actor=amina` matches the first expected call), it records the callback.
4. If all expected calls have been received, the workflow resumes.
5. If not all calls are in yet, it responds with a progress JSON and keeps waiting.

### Partial Response (waiting for more)

```json
{
  "status": "accepted",
  "message": "Callback received (actor=amina). Waiting for 1 more.",
  "received": 1,
  "expected": 2,
  "pending": ["actor=gokul"]
}
```

### Final Output (all received, workflow resumes)

```json
{
  "status": "complete",
  "expected": 2,
  "received": 2,
  "calls": {
    "actor=amina": {
      "matchKey": "actor=amina",
      "receivedAt": "2026-05-29T10:30:00.000Z",
      "body": {},
      "query": { "signature": "abc123...", "actor": "amina" }
    },
    "actor=gokul": {
      "matchKey": "actor=gokul",
      "receivedAt": "2026-05-29T10:35:00.000Z",
      "body": {},
      "query": { "signature": "abc123...", "actor": "gokul" }
    }
  }
}
```

## Notify External System

When "Notify External System About Callback URLs" is enabled, the node POSTs the following payload to the configured Notify URL when the execution starts waiting:

```json
{
  "callback_urls": [
    "http://localhost:5678/webhook-waiting/194?signature=abc123...&actor=amina",
    "http://localhost:5678/webhook-waiting/194?signature=abc123...&actor=gokul"
  ],
  "expected_calls": [
    { "queryParam": "actor", "queryValue": "amina" },
    { "queryParam": "actor", "queryValue": "gokul" }
  ]
}
```

Any fields from "Additional Data" are merged into this payload.

## State Persistence

The node uses an **in-memory store** (a `Map` at the module level) to track which callbacks have been received for each execution. This is necessary because n8n's `restartWebhook` mechanism reloads the execution from the database on each webhook call, which means standard `staticData` does not persist between calls.

### Implications

- State survives across multiple webhook calls within the same n8n process.
- State is lost if n8n restarts. However, the execution will eventually time out and resume with partial data.
- This approach works for single-instance n8n deployments. For multi-worker setups, an external persistence layer (Redis, database) would be needed.

## Example Use Case: Multi-Actor Approval Workflow

### Scenario

A form submission requires approval from two people (Amina and Gokul) before it can be processed. Both approvers receive an email with their unique approval link. The workflow waits until both have approved.

### Workflow Structure

```
[CHEFS Form Trigger] → [Build Context] → [Send Email to Amina]
                                        → [Send Email to Gokul]
                                        → [Multi Webhook Wait Node]
                                        → [Process Approved Submission]
```

### Node Configuration

| Field           | Value                                          |
| --------------- | ---------------------------------------------- |
| Expected Call 1 | Query Parameter: `actor`, Query Value: `amina` |
| Expected Call 2 | Query Parameter: `actor`, Query Value: `gokul` |
| Webhook Method  | GET                                            |
| Timeout         | 0 (unlimited)                                  |

### Step-by-Step Flow

1. A form is submitted via CHEFS.
2. The workflow builds context and generates the resume URL.
3. Emails are sent to Amina and Gokul, each containing their unique callback URL:
   - Amina's link: `http://n8n.example.com/webhook-waiting/194?signature=abc...&actor=amina`
   - Gokul's link: `http://n8n.example.com/webhook-waiting/194?signature=abc...&actor=gokul`
4. The Multi Webhook Wait Node pauses the execution.
5. Amina clicks her link → node responds with "Waiting for 1 more."
6. Gokul clicks his link → node sees all callbacks received → workflow resumes.
7. Downstream nodes process the approved submission with full callback data.

### What If Someone Doesn't Respond?

If a timeout is configured and not all callbacks arrive within that time, the execution resumes automatically. If timeout is set to 0 (the default), the workflow waits indefinitely — same behavior as n8n's built-in Wait node. Downstream nodes can check the output's `status` field or `received` count to determine if the approval was complete or partial.

## File Structure

```
community-nodes/
├── nodes/
│   └── MultiWebhookWait/
│       ├── MultiWebhookWait.node.ts      # Node implementation
│       └── MultiWebhookWait.node.json    # Codex metadata
├── icons/
│   ├── multi-webhook-wait.svg            # Light mode icon
│   └── multi-webhook-wait.dark.svg       # Dark mode icon
```

## Registration

The node is registered in `community-nodes/package.json` under the `n8n.nodes` array:

```json
"dist/nodes/MultiWebhookWait/MultiWebhookWait.node.js"
```

## Limitations

- **Single-instance only**: The in-memory store does not replicate across n8n worker instances.
- **State lost on restart**: If n8n restarts while waiting, previously received callbacks are forgotten. The execution will time out and resume with no callback data.
- **Duplicate calls**: If the same callback URL is called multiple times, only the latest call data is stored (keyed by `queryParam=queryValue`).
- **No authentication on callbacks**: The callbacks rely on n8n's built-in URL signature for security. There is no additional authentication layer on the webhook endpoint itself.
