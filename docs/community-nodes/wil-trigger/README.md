# WIL Trigger Node

The **WIL Trigger** node starts a workflow when a user clicks a WIL **Button** trigger or submits a **CHEFS form** trigger. WIL runs the workflow internally with the workflow owner's credentials (the triggering user is passed to the node as data, not impersonated), so there is no webhook URL to copy or protect.

Once a workflow containing this node is **published**, it appears in the workflow dropdown of the WIL trigger form.

## How It Works

1. Add **WIL Trigger** as the first node and publish the workflow.
2. In WIL, create a Button or CHEFS Form trigger and pick the workflow (and node) from the dropdown.
3. When the trigger fires, the external-hooks service checks the caller is allowed, re-validates that the workflow is still published and the node still exists, then starts the execution at this node.

The node does not listen for anything itself. WIL stores only the workflow id and the node id, so renaming the node or the workflow does not break a trigger. Unpublishing the workflow or deleting the node shows the trigger as _Unpublished_ / _Node removed_ in WIL, and firing it returns `409 WIL_TARGET_UNAVAILABLE`.

## Parameters

| Parameter            | Default            | Description                                                                                                                                                                           |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display Label        | node name          | Name shown in the WIL dropdown.                                                                                                                                                       |
| Description          | –                  | Help text shown next to the workflow.                                                                                                                                                 |
| Accepted Sources     | Button, CHEFS Form | Which WIL trigger types may select this workflow.                                                                                                                                     |
| Input Source         | Accept Any Input   | `passthrough`, declared `workflowInputs` fields, or fields inferred from a `jsonExample`. Declared fields are shown when configuring a button, and their types are validated on save. |
| Respond              | Immediately        | `lastNode` waits for the run and returns the last node's output to WIL.                                                                                                               |
| Response Timeout (s) | 30 (max 120)       | Only for `lastNode`. On timeout WIL answers 202 and the run continues.                                                                                                                |

Changing the parameter names or defaults requires the same change in external-hooks `helpers/wil-trigger-node.ts`, because n8n omits default-valued parameters from saved workflow JSON.

## Output

One item per fire:

```json
{
  "source": "wil",
  "trigger": { "id": "…", "type": "button", "name": "Approve" },
  "actor": { "email": "user@gov.bc.ca", "tenantId": "…", "roles": ["…"], "groups": ["…"] },
  "input": { "requestId": "abc-123" },
  "firedAt": "2026-10-06T19:00:00.000Z"
}
```

- **Button:** `input` is the configured input values (legacy JSON body as fallback).
- **CHEFS form:** `input` is the submission.
- Declared fields that were not supplied are `null`.
- In the editor, **Execute step** emits a sample item built from the declared fields.

## Operations

- `WIL_N8N_NODE_TRIGGERS_ENABLED=false` disables the feature (dropdown empty, firing returns 503) without a redeploy of the node.
- `WIL_TRIGGER_NODE_TYPES` overrides the accepted node type strings (default `CUSTOM.wilTrigger,community-nodes.wilTrigger`, the prefix depends on how n8n loads the package).
- Runs start with execution mode `trigger`, so they appear in the execution list like any trigger-started run and count as normal executions.
