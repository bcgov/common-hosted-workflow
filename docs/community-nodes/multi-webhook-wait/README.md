# Multi Webhook Wait Node

The **Multi Webhook Wait** node pauses a workflow execution and waits for multiple webhook callbacks before resuming. It enables parallel approval workflows, multi-actor sign-offs, and fan-in patterns where you need N independent confirmations before proceeding.

## How It Works

```
Workflow starts
    │
    ▼
┌───────────────────────────────────┐
│  Create actions / notify actors   │  (one per expected callback)
└───────────────────┬───────────────┘
                    │
                    ▼
┌───────────────────────────────────┐
│  Multi Webhook Wait Node          │
│  • Registers expected callbacks   │
│  • Generates callback URLs        │
│  • Puts execution to sleep        │
└───────────────────┬───────────────┘
                    │
    External actors POST to their callback URLs
    (each URL has a unique query param identifying the actor)
                    │
                    ▼
┌───────────────────────────────────┐
│  When ALL callbacks received:     │
│  • Execution resumes              │
│  • Output contains all call data  │
└───────────────────────────────────┘
```

### Key Features

- **Parallel wait**: Waits for 2, 5, or 100 callbacks — any number
- **Crash-safe**: State is persisted in PostgreSQL, survives n8n restarts
- **Idempotent**: Duplicate callbacks are safely ignored
- **Dynamic**: Expected calls can be defined statically or generated from previous node output
- **Timeout support**: Optional maximum wait time before auto-resuming
- **Two operations**: **Wait** (register + pause) and **Clear** (report partial completion + delete DB state) — see [Handling Timeouts](#handling-timeouts)
- **Notify support**: Optionally POSTs callback URLs to an external system when the wait begins
- **No credentials required**: Uses environment variables (`N8N_BASE_URL`, `INTERNAL_AUTH_TOKEN`) directly

---

## Configuration

### Operation

| Value              | Behavior                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Wait** (default) | Registers expected callbacks and pauses the workflow until they all arrive (or it times out)                                              |
| **Clear**          | Reports the current completion status for `$execution.id` (how many callbacks completed vs. are still pending) and deletes its DB entries |

Use **Clear** downstream of a **Wait** node's timeout branch (e.g. after the `limitWaitTime` timeout resumes the execution) to get a partial-execution summary and clean up the DB row that the timed-out wait left behind. See [Handling Timeouts](#handling-timeouts) below.

### Mode Toggle: Define Expected Calls Statically

| Value            | Behavior                                                             |
| ---------------- | -------------------------------------------------------------------- |
| **ON** (default) | Define each expected callback manually using the fixed collection UI |
| **OFF**          | Provide a JSON array (supports expressions from previous nodes)      |

### Static Mode — Expected Calls

Add one entry per expected callback:

| Field           | Description                                            | Example |
| --------------- | ------------------------------------------------------ | ------- |
| Query Parameter | The URL query param name that identifies this callback | `actor` |
| Query Value     | The unique value for this specific callback            | `alice` |

### Dynamic Mode — Expected Calls (Dynamic)

A JSON array where each object has `queryParam` and `queryValue`:

```json
[
  { "queryParam": "actor", "queryValue": "alice" },
  { "queryParam": "actor", "queryValue": "bob" },
  { "queryParam": "actor", "queryValue": "charlie" }
]
```

**Expression example** (from a previous node that outputs a list of approvers):

```
={{ $json.approvers.map(name => ({queryParam: "actor", queryValue: name})) }}
```

### Other Options

| Option                     | Description                                                                   |
| -------------------------- | ----------------------------------------------------------------------------- |
| **Limit Wait Time**        | Enable to set a maximum wait duration                                         |
| **Timeout (Minutes)**      | Minutes before the execution resumes automatically (default: 1440 = 24h)      |
| **Notify External System** | POST the generated callback URLs to an external endpoint when the wait starts |
| **Notify URL**             | The URL to POST to                                                            |
| **Additional Data**        | Extra JSON payload included in the notify POST body                           |

---

## Callback URLs

When the node starts waiting, it generates one callback URL per expected call. The format is:

```
http://<n8n-host>/webhook-waiting/<executionId>?signature=<token>&<queryParam>=<queryValue>
```

**Example** (for 2 actors):

```
http://localhost:5678/webhook-waiting/320?signature=abc123&actor=alice
http://localhost:5678/webhook-waiting/320?signature=abc123&actor=bob
```

External systems (or users) send a **POST** request to these URLs to signal their callback.

### Sending a Callback

```bash
# Simple callback (no body)
curl -X POST "http://localhost:5678/webhook-waiting/320?signature=abc123&actor=alice"

# Callback with data payload
curl -X POST "http://localhost:5678/webhook-waiting/320?signature=abc123&actor=alice" \
  -H "Content-Type: application/json" \
  -d '{"decision": "approved", "comment": "Looks good"}'
```

### Callback Responses

**Partial (more callbacks expected):**

```json
{
  "status": "accepted",
  "message": "Callback received (actor=alice). Waiting for 1 more.",
  "received": 1,
  "expected": 2,
  "pending": ["actor=bob"]
}
```

**Complete (all callbacks received — execution resumes):**

```json
{
  "status": "complete",
  "message": "All callbacks received (2/2). Execution resumed.",
  "expected": 2,
  "received": 2,
  "calls": {
    "actor=alice": { "body": {"decision": "approved"}, "query": {...}, "receivedAt": "..." },
    "actor=bob": { "body": {"decision": "approved"}, "query": {...}, "receivedAt": "..." }
  }
}
```

---

## Output

When all callbacks are received, the node outputs a single item:

```json
{
  "status": "complete",
  "message": "All callbacks received (2/2). Execution resumed.",
  "expected": 2,
  "received": 2,
  "calls": {
    "actor=alice": {
      "body": { "decision": "approved", "comment": "LGTM" },
      "query": { "actor": "alice", "signature": "abc123" },
      "receivedAt": "2026-07-20T16:40:00.000Z"
    },
    "actor=bob": {
      "body": { "decision": "approved", "comment": "Ship it" },
      "query": { "actor": "bob", "signature": "abc123" },
      "receivedAt": "2026-07-20T16:42:00.000Z"
    }
  }
}
```

Use downstream nodes (Set, Code, IF) to process individual actor responses from `$json.calls`.

---

## Handling Timeouts

### Why the Wait node's own timeout output can't be trusted

When a timed-out execution resumes, n8n does **not** re-run the Wait node's `execute()` method or use whatever it returned before waiting. Internally, n8n's `WorkflowExecute.handleWaitingState()` (in `n8n-core`) does this to the waiting node on every timer-based resume:

```js
handleWaitingState(workflow) {
    if (this.runExecutionData.waitTill) {
        this.runExecutionData.waitTill = undefined;
        const executionStackEntry = this.runExecutionData.executionData.nodeExecutionStack[0];
        executionStackEntry.node.disabled = true;                       // forces the node into "disabled" mode
        const lastNodeExecuted = this.runExecutionData.resultData.lastNodeExecuted;
        this.runExecutionData.resultData.runData[lastNodeExecuted].pop(); // discards whatever it returned pre-wait
    }
}
```

It discards the `{status: 'timeout', ...}` object built in `execute()` and marks the node **disabled**, so n8n's standard disabled-node behavior kicks in: the node's output becomes its **input, unchanged** (executes instantly, `executionTime: 0`). This was confirmed by decoding a real execution's stored run data — the Wait node's output after a timer-based timeout was byte-for-byte the same items that came in from the upstream Merge node, not the `status: 'timeout'` payload from `execute()`.

This does **not** apply to webhook-driven completion — when all callbacks arrive, `webhook()` supplies fresh `workflowData` directly, so `status: 'complete'` and `calls` reliably reach the next node.

### The fix: a downstream Clear node + an IF gate

Since the Wait node's own output can't tell you it timed out, use a second **Multi Webhook Wait Node** configured with **Operation: Clear** downstream, gated by an **IF** node so a genuine completion isn't routed through it (Clear would report `not_found`, since the webhook-completion handler already deleted the DB row — see [Internal Flow](#internal-flow) — and you'd lose the real `calls` payload sitting in the Wait node's own output):

```
[Multi Webhook Wait Node]  (Operation: Wait, Limit Wait Time: ON)
         │
         ▼
       [IF]  {{ $json.status === 'complete' && $json.calls !== undefined }}
         │
   true ─┴─ false
    │          │
    ▼          ▼
[Use            [Multi Webhook Wait Node]  (Operation: Clear)
 $json.calls              │
 directly]                ▼
                  [Process partial results]
```

Don't check for `$json.status === 'timeout'` — that value is built by `execute()` but, per the above, never survives a timer-based resume. Check for the positive, reliable signal (`status === 'complete'`) instead, and treat anything else as "not complete."

The Clear node looks up DB state by `$execution.id` (the same execution the Wait node ran in), so no Expected Calls configuration is needed on it. It returns:

```json
{
  "status": "partial",
  "message": "Cleared multi-webhook wait state for execution 320. 1/2 callbacks were received.",
  "expected": 2,
  "completed": 1,
  "pending": 1,
  "completedCallbacks": ["actor=alice"],
  "pendingCallbacks": ["actor=bob"],
  "calls": {
    "actor=alice": { "body": { "decision": "approved" }, "query": {...}, "receivedAt": "..." }
  }
}
```

If no entries exist for the execution (e.g. already cleaned up, or Clear was run twice), it returns `{ "status": "not_found", ... }` instead of erroring.

### Timeout timing is approximate, not exact

n8n only discovers newly-waiting executions on a 60-second polling interval (`WaitTracker.startTracking()` — `setInterval(..., 60000)`), plus once at process startup. A short `Limit Wait Time` (e.g. 3 seconds) can sit undiscovered for up to ~60 seconds before n8n even schedules the precise timer for it, so the actual resume can lag well behind the configured amount. This is a platform characteristic shared by the native `n8n-nodes-base.wait` node — not something this node's code controls. For timeouts of a few minutes or more, the effect is negligible.

---

## Example: Multi-Actor Approval with Workflow Interaction Layer

This is the primary use case — create WIL actions for multiple actors and wait for all of them to respond before continuing.

### Workflow Structure

```
[Webhook Trigger]
       │
       ▼
[Get Form Details]  (fetch form metadata from a data table)
       │
       ▼
[Edit Fields]  (prepare data)
       │
       ├──▶ [WIL: Create Action for Actor 1]  (callbackUrl: resumeUrl + &actor=alice)
       │
       └──▶ [WIL: Create Action for Actor 2]  (callbackUrl: resumeUrl + &actor=bob)
                    │
                    ▼
              [Merge Node]
                    │
                    ▼
         [Multi Webhook Wait Node]  (expects: actor=alice, actor=bob)
                    │
                    ▼
         [Process Results]  (both actors have responded)
```

### Step-by-Step Setup

#### 1. Create Actions with Callback URLs

Each **Workflow Interaction Layer** action node sets its `callbackUrl` to include the actor identifier appended to the execution's resume URL:

```
={{ $execution.resumeUrl + '&actor=alice' }}
```

This tells the WIL service: "When this actor responds, POST to this URL with `?actor=alice` in the query string."

#### 2. Configure the Multi Webhook Wait Node

**Dynamic mode** (recommended when actors come from data):

```json
[
  { "queryParam": "actor", "queryValue": "alice" },
  { "queryParam": "actor", "queryValue": "bob" }
]
```

Or with an expression that reads actor identifiers from input data:

```
={{ $json.actors.map(a => ({queryParam: "actor", queryValue: a.email})) }}
```

**Static mode** (for fixed, known actors):

Add two entries manually:

- Query Parameter: `actor`, Query Value: `alice`
- Query Parameter: `actor`, Query Value: `bob`

#### 3. Process Results Downstream

After the wait node resumes, access individual actor responses in downstream nodes:

```
// In a Code node or expression:
{{ $json.calls["actor=alice"].body.decision }}  // "approved"
{{ $json.calls["actor=bob"].body.comment }}     // "Ship it"
```

### Sample Workflow JSON

Below is a complete working workflow demonstrating the pattern with two WIL actions and a Multi Webhook Wait node:

```json
{
  "nodes": [
    {
      "parameters": {
        "path": "approval-trigger",
        "options": {}
      },
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [-768, -304],
      "name": "Webhook Trigger"
    },
    {
      "parameters": {
        "resource": "action",
        "actorId": "alice@example.com",
        "actionType": "showform",
        "actionTitle": "Please Review and Approve",
        "callbackUrl": "={{ $execution.resumeUrl + '&actor=alice' }}"
      },
      "type": "CUSTOM.workflowInteractionLayer",
      "typeVersion": 1,
      "position": [-96, -416],
      "name": "Create Action for Alice",
      "credentials": {
        "workflowInteractionLayerApi": {
          "id": "your-credential-id",
          "name": "Your WIL Credential"
        }
      }
    },
    {
      "parameters": {
        "resource": "action",
        "actorId": "bob@example.com",
        "actionType": "showform",
        "actionTitle": "Please Review and Approve",
        "callbackUrl": "={{ $execution.resumeUrl + '&actor=bob' }}"
      },
      "type": "CUSTOM.workflowInteractionLayer",
      "typeVersion": 1,
      "position": [-96, -208],
      "name": "Create Action for Bob",
      "credentials": {
        "workflowInteractionLayerApi": {
          "id": "your-credential-id",
          "name": "Your WIL Credential"
        }
      }
    },
    {
      "parameters": {},
      "type": "n8n-nodes-base.merge",
      "typeVersion": 3.2,
      "position": [144, -304],
      "name": "Merge"
    },
    {
      "parameters": {
        "useStaticExpectedCalls": false,
        "expectedCallsDynamic": "[\n  {\"queryParam\": \"actor\", \"queryValue\": \"alice\"},\n  {\"queryParam\": \"actor\", \"queryValue\": \"bob\"}\n]"
      },
      "type": "CUSTOM.multiWebhookWait",
      "typeVersion": 1,
      "position": [336, -304],
      "name": "Multi Webhook Wait Node"
    },
    {
      "parameters": {},
      "type": "n8n-nodes-base.noOp",
      "typeVersion": 1,
      "position": [576, -304],
      "name": "Process Results"
    }
  ],
  "connections": {
    "Webhook Trigger": {
      "main": [
        [
          { "node": "Create Action for Alice", "type": "main", "index": 0 },
          { "node": "Create Action for Bob", "type": "main", "index": 0 }
        ]
      ]
    },
    "Create Action for Alice": {
      "main": [[{ "node": "Merge", "type": "main", "index": 0 }]]
    },
    "Create Action for Bob": {
      "main": [[{ "node": "Merge", "type": "main", "index": 1 }]]
    },
    "Merge": {
      "main": [[{ "node": "Multi Webhook Wait Node", "type": "main", "index": 0 }]]
    },
    "Multi Webhook Wait Node": {
      "main": [[{ "node": "Process Results", "type": "main", "index": 0 }]]
    }
  }
}
```

---

## Example: Dynamic Approvers from a List

When the number of approvers isn't known at design time:

```
[Get Approvers List]  →  outputs: {approvers: ["alice@example.com", "bob@example.com", "charlie@example.com"]}
        │
        ▼
[Loop: Create WIL Action for each approver]
  (callbackUrl: $execution.resumeUrl + '&actor=' + $json.email)
        │
        ▼
[Multi Webhook Wait Node]
   expectedCallsDynamic: ={{ $json.approvers.map(email => ({queryParam: "actor", queryValue: email})) }}
        │
        ▼
[All approvers have responded — continue]
```

---

## Architecture

### State Persistence

Unlike the previous in-memory implementation, this node persists all state in PostgreSQL via the external-hooks service. This means:

- State survives n8n restarts
- Works in multi-worker/queue-mode deployments
- No data loss if a callback arrives during a restart

### Internal Flow

1. **execute() — Operation: Wait**: Registers expected callbacks with the external-hooks DB, puts execution to wait
2. **webhook()**: Called by n8n each time a POST hits the webhook-waiting URL:
   - Matches the incoming query params to an expected call
   - Calls the external-hooks service to mark it received (DB update)
   - If not all received → returns `{ webhookResponse }` (n8n keeps waiting)
   - If all received → returns `{ workflowData }` (n8n resumes execution) **and** the route handler deletes the DB row immediately (see [multi-webhook-wait.ts](../../../external-hooks/src/api/routes/multi-webhook-wait.ts))
3. **execute() — Operation: Clear**: Fetches live status (`GET /status/:executionId`) and deletes the DB row (`DELETE /cleanup/:executionId`) for `$execution.id`. Used downstream of a timed-out Wait node — see [Handling Timeouts](#handling-timeouts)

### Database Tables

Created by Drizzle migration `0009_multi_webhook_wait.sql`:

| Table                     | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `multi_webhook_wait`      | One row per waiting execution (tracks total expected/received)   |
| `multi_webhook_wait_call` | One row per expected callback (tracks received status + payload) |

State is automatically cleaned up when all callbacks arrive and the execution resumes.

---

## Environment Requirements

The node requires these environment variables (already configured in the standard Docker setup):

| Variable              | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `N8N_BASE_URL`        | Base URL of the n8n instance (e.g. `http://localhost:5678`) |
| `INTERNAL_AUTH_TOKEN` | Shared secret for internal service-to-service auth          |

No credentials need to be configured on the node itself.

---

## File Structure

```
community-nodes/
├── nodes/
│   └── MultiWebhookWait/
│       ├── MultiWebhookWait.node.ts      # Node implementation
│       └── MultiWebhookWait.node.json    # Codex metadata (links to this doc)
├── icons/
│   ├── multi-webhook-wait.svg            # Light mode icon
│   └── multi-webhook-wait.dark.svg       # Dark mode icon

external-hooks/
├── src/
│   ├── db/
│   │   ├── schema/multi-webhook-wait.ts          # Drizzle table definitions
│   │   └── repository/custom/multi-webhook-wait.ts  # Data access layer
│   └── api/
│       ├── services/multi-webhook-wait.service.ts  # Business logic
│       ├── routes/multi-webhook-wait.ts            # API endpoints
│       └── schemas/multi-webhook-wait.ts           # Zod validation
├── drizzle/
│   └── 0009_multi_webhook_wait.sql               # Database migration
```

---

## Troubleshooting

| Issue                                                                                   | Cause                                                                                                                                                   | Fix                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 404 on callback URL                                                                     | Sending GET instead of POST                                                                                                                             | Use `curl -X POST` or configure the caller to POST                                                                                                                                                         |
| 500 on register                                                                         | Database tables don't exist                                                                                                                             | Run the Drizzle migration or rebuild Docker (`docker-compose up --build`)                                                                                                                                  |
| "Cannot determine n8n base URL"                                                         | `N8N_BASE_URL` env var missing                                                                                                                          | Add it to your `.env` / docker-compose                                                                                                                                                                     |
| "INTERNAL_AUTH_TOKEN is not configured"                                                 | Env var missing                                                                                                                                         | Add `INTERNAL_AUTH_TOKEN` to your `.env` / docker-compose                                                                                                                                                  |
| Duplicate callbacks ignored                                                             | Same actor calling twice                                                                                                                                | By design — idempotent. Only the first call counts                                                                                                                                                         |
| Wait node's output after timeout looks like its _input_, not `{status: 'timeout', ...}` | n8n discards the node's pre-wait return value and disables it (pure passthrough) on every timer-based resume — this is n8n platform behavior, not a bug | Don't rely on the Wait node's own output for timeout detection. Gate on `$json.status === 'complete'` and route the `false` branch to a Clear-operation node — see [Handling Timeouts](#handling-timeouts) |
| Short `Limit Wait Time` (e.g. 3s) takes much longer to actually resume                  | n8n's WaitTracker only polls for new waiting executions every 60 seconds                                                                                | Expected — see [Timeout timing is approximate](#timeout-timing-is-approximate-not-exact). Not fixable from node code                                                                                       |
| `firstEntryJson` response on final call                                                 | Old Docker image without `responseData: ''` fix                                                                                                         | Rebuild Docker with latest code                                                                                                                                                                            |

---

## API Endpoints (External-Hooks Service)

These are internal endpoints used by the node. You typically don't call them directly.

| Method | Path                                                       | Auth              | Purpose                                                        |
| ------ | ---------------------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| POST   | `/rest/custom/v1/multi-webhook-wait/register`              | Bearer (internal) | Register expected callbacks                                    |
| POST   | `/rest/custom/v1/multi-webhook-wait/callback/:executionId` | Bearer (internal) | Mark a callback as received                                    |
| GET    | `/rest/custom/v1/multi-webhook-wait/status/:executionId`   | Bearer (internal) | Check current progress (used by the Clear operation)           |
| DELETE | `/rest/custom/v1/multi-webhook-wait/cleanup/:executionId`  | Bearer (internal) | Delete DB state for an execution (used by the Clear operation) |

---

## Limitations

- **POST only**: Callback URLs must be called with HTTP POST (not GET). This is by design for security — prevents accidental resume via browser link previews.
- **Query param matching**: Each expected call is identified by exactly one query param/value pair. Complex matching (multiple params per call) is not supported.
- **No partial resume**: The workflow only resumes when ALL expected calls are received (or timeout). There is no "resume after N of M" mode.
- **No live timeout hook**: n8n discards the Wait operation's pre-wait return value and disables the node on timer-based resume (pure input passthrough), so its own output can never reflect callbacks that arrived mid-wait. Use a downstream Clear-operation node, gated on `$json.status === 'complete'`, to get an accurate partial-completion report — see [Handling Timeouts](#handling-timeouts).
- **Timeout timing is approximate**: n8n's WaitTracker polls for newly-waiting executions every 60 seconds, so short `Limit Wait Time` values (seconds) can resume much later than configured. See [Timeout timing is approximate](#timeout-timing-is-approximate-not-exact).
