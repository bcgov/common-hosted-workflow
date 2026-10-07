# Trigger Targets — WIL Trigger Node

A WIL **Button** or **CHEFS Form** trigger can point at one of two targets:

| `targetKind`                          | What runs                                                                | Stored columns                         |
| ------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `n8n-node` (default for new triggers) | A published n8n workflow, started in-process at its **WIL Trigger** node | `target_workflow_id`, `target_node_id` |
| `url` (legacy)                        | An outbound HTTP call to a webhook URL                                   | `trigger_url`, `trigger_method`        |

The database enforces the shape with `chk_wt_target_shape`; existing rows migrate to `url` unchanged. See the node's [documentation](../../community-nodes/wil-trigger/README.md).

## Flow

1. The editor picks a workflow from `GET /ui-api/wil/trigger-targets?source=button|chefs-form`.
2. `POST/PUT /ui-api/wil/triggers` validates the target (published, in a tenant project, node present and enabled, accepts the trigger type, button input values match the node's declared fields) and stores only `(workflowId, nodeId)`.
3. `POST /ui-api/wil/triggers/:id/callback` checks the actor, **re-resolves the target against n8n's published version**, then starts the run with execution mode `trigger`. No webhook URL is involved and the request never leaves the n8n process.

## Endpoints

### GET /ui-api/wil/trigger-targets

Manager-only. Query: `source` (optional). Returns `{ data: Target[], enabled: boolean }`; `enabled` is `false` (and `data` empty) when `WIL_N8N_NODE_TRIGGERS_ENABLED=false`. Each target carries `workflowId`, `workflowName`, `nodeId`, `label`, `description`, `acceptedSources`, `inputSchema`, `respondMode`, `responseTimeoutSec`.

### POST/PUT /ui-api/wil/triggers

The body is a union on `targetKind`; omitting it means `url`, so existing clients keep working.

```json
{
  "triggerType": "button",
  "targetKind": "n8n-node",
  "targetWorkflowId": "abc123",
  "targetNodeId": "6f1c…",
  "metadata": { "buttonText": "Approve", "inputValues": { "amount": 100 } },
  "allowedActorsType": "all",
  "allowedActors": ["*"]
}
```

An unavailable target or invalid input values return `422` with `details.reason` / `details.errors`. Responses and list items add `targetKind`, `targetWorkflowId`, `targetNodeId` and `targetStatus` (`live` | `unpublished` | `missing-node`, null for URL triggers).

### POST /ui-api/wil/triggers/:id/callback (node targets)

| Outcome                                                         | Status | Body                                    |
| --------------------------------------------------------------- | ------ | --------------------------------------- |
| Started (`respondMode: immediately`, or `lastNode` timed out)   | 202    | `{ success, executionId }`              |
| Finished within the timeout (`lastNode`)                        | 200    | `{ success, executionId, result }`      |
| Workflow unpublished / node removed / source no longer accepted | 409    | `details.code = WIL_TARGET_UNAVAILABLE` |
| Run failed                                                      | 502    | `{ error: { executionId } }`            |
| Feature disabled                                                | 503    | –                                       |

The item given to the node: `{ source: 'wil', trigger: { id, type, name }, actor: { email, tenantId, roles, groups }, input, firedAt }`. For buttons `input` is `metadata.inputValues`; for CHEFS forms it is the submitted body.

## Configuration

| Variable                        | Default                                        | Purpose                                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WIL_N8N_NODE_TRIGGERS_ENABLED` | `true`                                         | Kill switch. When `false`, the dropdown is empty, saving node targets fails with 400, and firing returns 503; legacy URL triggers are unaffected.                                                     |
| `WIL_TRIGGER_NODE_TYPES`        | `CUSTOM.wilTrigger,community-nodes.wilTrigger` | Comma-separated node type strings used for discovery. n8n prefixes the node with its package name: `CUSTOM` when loaded from a custom extensions folder, `community-nodes` for the installed package. |

## Implementation notes

- `N8nWorkflowRunnerService` is the only module that touches n8n execution internals (`WorkflowRunner`, `ActiveExecutions`); it resolves them lazily and degrades to a 503 if they cannot be found after an n8n upgrade.
- Discovery reads n8n's published workflow history (honouring `N8N_USE_WORKFLOW_PUBLICATION_SERVICE`), so only published, non-archived workflows owned by the tenant's projects are listed.
- Runs are subject to n8n's usual execution handling (queue mode, credential checks); see `.kiro/artifacts/wil-trigger-node/PHASE0-FINDINGS.md` for the items that still need a live-instance check.
