# Trigger Targets — WIL Trigger Node

A WIL **Button** or **CHEFS Form** trigger runs a single kind of target:

| `targetKind`      | What runs                                                                | Stored columns                         |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `n8n-node` (only) | A published n8n workflow, started in-process at its **WIL Trigger** node | `target_workflow_id`, `target_node_id` |

The outbound webhook-URL target that earlier drafts supported has been removed — a trigger can only invoke a WIL Trigger node. **Breaking change:** migration `0011` deletes every existing trigger that has a `trigger_url` (all legacy webhook triggers) and drops the `trigger_url` / `trigger_method` columns. Re-create those triggers against a WIL Trigger node after deploying. The database enforces the node-only shape with `chk_wt_target_shape`. See the node's [documentation](../../community-nodes/wil-trigger/README.md).

## Flow

1. The editor picks a workflow from `GET /ui-api/wil/trigger-targets?source=button|chefs-form`.
2. `POST/PUT /ui-api/wil/triggers` validates the target (published, in a tenant project, node present and enabled, accepts the trigger type, button input values match the node's declared fields) and stores only `(workflowId, nodeId)`.
3. `POST /ui-api/wil/triggers/:id/callback` checks the actor, **re-resolves the target against n8n's published version**, then starts the run with execution mode `trigger`. No webhook URL is involved and the request never leaves the n8n process.

## Trust model

- **Binding:** any tenant manager (`project:editor` in the tenant, or the owner of a personal-project tenant) can bind a trigger to any published WIL Trigger workflow owned by one of the tenant's projects. WIL does not check the manager's own n8n access to that workflow, because tenant roles are tenant-wide, not per project.
- **Exposure:** whoever can publish a workflow containing a WIL Trigger node makes it available to every manager of the tenant. `Accepted Sources` on the node is the only per-workflow gate.
- **Execution identity:** the run uses the workflow owner's credentials. The firing user is passed in `actor` as data only; it is not signed and not an n8n identity, so workflows must not treat it as proof of identity beyond what WIL's own checks already enforced.
- **Results:** in `lastNode` mode the last node's output is returned to the caller, so workflow authors must not output data the allowed actors should not see.
- **Tenant scope:** the tenant comes from the `X-TENANT-ID` header, and CSTAR tenant-access verification is still a `TODO` (shared with the rest of the WIL routes).

## Endpoints

### GET /ui-api/wil/trigger-targets

Manager-only. Query: `source` (optional). Returns `{ data: Target[], enabled: boolean }`; `enabled` is `false` (and `data` empty) when `WIL_N8N_NODE_TRIGGERS_ENABLED=false`. Each target carries `workflowId`, `workflowName`, `nodeId`, `label`, `description`, `acceptedSources`, `inputSchema`, `respondMode`, `responseTimeoutSec`.

### POST/PUT /ui-api/wil/triggers

`targetKind` is always `n8n-node`; it may be omitted and defaults to `n8n-node`. The body below is for `POST`. `PUT /ui-api/wil/triggers/:triggerId` uses a strict schema that does not accept `triggerType` (the type cannot change after creation), and unknown keys such as the legacy `triggerUrl` are rejected.

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

An unavailable target or invalid input values return `422` with `details.reason` / `details.errors`. Responses and list items include `targetKind`, `targetWorkflowId`, `targetNodeId` and `targetStatus` (`live` | `unpublished` | `missing-node`).

### POST /ui-api/wil/triggers/:id/callback

| Outcome                                                         | Status | Body                                        |
| --------------------------------------------------------------- | ------ | ------------------------------------------- |
| Started (`respondMode: immediately`, or `lastNode` timed out)   | 202    | `{ success, executionId }`                  |
| Finished within the timeout (`lastNode`)                        | 200    | `{ success, executionId, result }`          |
| Workflow unpublished / node removed / source no longer accepted | 409    | `details.code = WIL_TARGET_UNAVAILABLE`     |
| Run failed                                                      | 502    | `{ error: { message, executionId } }`       |
| Workflow failed to start                                        | 502    | `{ error: { message } }` (no `executionId`) |
| Feature disabled, or n8n internals not found after an upgrade   | 503    | –                                           |
| Caller not allowed, or tenant has no linked projects            | 403    | –                                           |
| Unknown trigger id                                              | 404    | –                                           |
| Missing or invalid `X-TENANT-ID`                                | 400    | –                                           |

A `lastNode` run that is still waiting or running (for example at a Wait node) also returns 202, and `result` is omitted when the last node produced no output.

The item given to the node: `{ source: 'wil', trigger: { id, type, name }, actor: { email, tenantId, roles, groups }, input, firedAt }`. For buttons `input` is `metadata.inputValues`; for CHEFS forms it is the submitted body.

## Configuration

| Variable                                                                                                                                    | Default                                        | Purpose                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WIL_N8N_NODE_TRIGGERS_ENABLED` (only the exact value `false` disables it; read at startup, so changing it needs an external-hooks restart) | `true`                                         | Kill switch for the whole feature. When `false`, the dropdown is empty, saving a trigger fails with 400, and firing returns 503.                                                                      |
| `WIL_TRIGGER_NODE_TYPES`                                                                                                                    | `CUSTOM.wilTrigger,community-nodes.wilTrigger` | Comma-separated node type strings used for discovery. n8n prefixes the node with its package name: `CUSTOM` when loaded from a custom extensions folder, `community-nodes` for the installed package. |

## Implementation notes

- `N8nWorkflowRunnerService` is the only module that touches n8n execution internals (`WorkflowRunner`, `ActiveExecutions`); it resolves them lazily and degrades to a 503 if they cannot be found after an n8n upgrade.
- Discovery reads n8n's published workflow history (honouring `N8N_USE_WORKFLOW_PUBLICATION_SERVICE`), so only published, non-archived workflows owned by the tenant's projects are listed.
- Runs are subject to n8n's usual execution handling (queue mode, credential checks); see `.kiro/artifacts/wil-trigger-node/PHASE0-FINDINGS.md` for the items that still need a live-instance check.
