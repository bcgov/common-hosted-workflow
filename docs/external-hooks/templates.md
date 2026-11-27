# Static workflow templates

This directory is the local n8n template library. It is read once when the
external-hooks templates router is constructed; no database or migration is
involved.

## Add a template

Create one directory per template:

```text
templates/
  my-template/
    template.json
  collections.json       # optional
```

`template.json` has three important parts:

- **Template metadata** — `id`, `name`, `description`, `createdAt`, `user`,
  `categories`, and optional `rank`, `totalViews`, and `image`.
- **`nodes`** — one display descriptor per distinct node type. These descriptors
  provide the icons shown in the template browser. `id`, `name`, and
  `displayName` are required; `name` is the n8n node type, such as
  `n8n-nodes-base.set`.
- **`workflow`** — the importable n8n graph, containing `nodes` and
  `connections`, plus optional `settings` and `meta`. Graph node `name` values
  must match the names used by `connections`.

Template and collection category IDs are required numbers. The search endpoint
filters templates by category **name**, while the collections endpoint filters
by category **ID**, so IDs must be stable and consistent across files.

`rank` controls the default curation order (lower values first, then template
ID). Search results can also be sorted by `views`, `createdAt`, or `name`.

## Description convention

Every template description uses these three H2 sections in this order, with
non-empty content in each section:

```markdown
## What it does

Summarize the trigger, main nodes, and useful outcome.

## Setup

List credential, environment, field-mapping, testing, and activation steps.

## Notes

Document Preview behavior, response semantics, limitations, safety precautions,
and links to detailed runbooks.
```

Use **Setup** rather than alternate headings such as **Try it** or **Before
activating**. Keep actionable instructions in Setup and behavioral warnings or
implementation details in Notes. The shipped-inventory tests enforce the three
headings and their order.

## Public-data rules

The template endpoints are unauthenticated because the browser fetches them
directly. Treat every file here as public content.

- Do not include credentials, API keys, tokens, passwords, or private execution
  payloads in any field, including node `parameters` and descriptions.
- Node-level `credentials` are removed during validation, but this is not a
  general secret scanner.
- `workflow.pinData` is deliberately discarded. Pinned executions often contain
  production data and are never published by this library.
- Use resource-locator objects for nodes that require them, for example:

  ```json
  "documentId": { "__rl": true, "mode": "id", "value": "YOUR_SPREADSHEET_ID" }
  ```

## Collections

`collections.json` accepts `{ "collections": [...] }` (a bare array is also
accepted). Each collection has an `id`, `name`, `createdAt`, and `workflowIds`.
Unknown workflow IDs are logged and removed. If `nodes` is empty, the loader
builds a de-duplicated icon list from the member templates. Relative image URLs
are converted using `N8N_BASE_URL` for both templates and collections.

Malformed files are logged and skipped rather than preventing n8n from
starting. When duplicate template or collection IDs are found, the first entry
in deterministic file order wins and later entries are logged and skipped.

## DevX Message Connector examples

Templates `2001` through `2011` cover every DevX Message Connector type and
source/subtype: Text, HTML, Adaptive Card, Generic, Rocket.Chat, GitHub
`pull_request`, GitHub `workflow_run`, Backup Container, Sysdig, StatusCake, and
Uptime.com. Collection `2` groups all eleven examples.

Templates `2001` through `2004` use **Manual Trigger → DevX Message Connector**
with constant example content. The source-specific templates `2005` through
`2011` use **Webhook → DevX Message Connector**. Their webhooks accept `POST` at
unique paths under `devx/`, respond when the last node finishes, and map the
connector payload with `={{ $json.body }}`. Use the test URL while editing;
activate the imported workflow before configuring the source with its production
`/webhook/devx/...` URL. The exported community-node type is case-sensitive:
`CUSTOM.devXMessageConnector`, with `typeVersion: 0.1`.

Every example uses **Mode: Preview**. Preview avoids posting to Teams, but it is
not an offline transformation mode. It still requires a `devXConnector`
credential containing the full Teams channel link, plus
`DEVX_CONNECTOR_API_URL` and `DEVX_CONNECTOR_API_KEY`, and calls
`<DEVX_CONNECTOR_API_URL>/api/v1/messages/preview`. Change **Mode** to **Send**
only after reviewing the preview response. The constant examples and realistic
webhook request bodies are also executed against the real connector in
`community-nodes/tests/DevXMessageConnector/templates.test.ts`.

## CHEFS and approval examples

Collection `3` contains two human-in-the-loop examples:

- Template `3001` publishes the complete sample from
  `docs/integrations/chefs/samples/chefs-event-subscription-review-loop.json`.
  It receives a CHEFS Event Subscription webhook, obtains a reviewer decision
  through the Workflow Interaction Layer, emails the result, and loops through
  CHEFS Resubmit Wait when changes are requested. Follow
  [Pattern A — CHEFS Event Subscription](../integrations/chefs/event-subscription.md)
  to attach Header Auth, CHEFS Form Authentication, Workflow Interaction Layer
  API, and SMTP credentials; replace the example form field mappings; and
  configure the CHEFS Event Subscription endpoint.
- Template `3002` publishes the Multi Webhook Wait sample from
  `docs/community-nodes/multi-webhook-wait/README.md`. Two WIL Show Form actions
  use actor-specific callback URLs before Multi Webhook Wait fans the responses
  back into one execution. The template makes the sample's Action / Create,
  User actor type, and POST callback settings explicit. Each WIL action needs
  WIL API and CHEFS Form Authentication credentials, and the wait node requires
  `N8N_BASE_URL` and `INTERNAL_AUTH_TOKEN` in the runtime.

The published graphs deliberately omit credential references and `pinData`.

## Operational notification examples

Collection `4` contains five **Webhook → Code → DevX Message Connector**
examples. Their Code nodes are copied from the linked runbooks, their webhooks
use unique POST paths and respond immediately, and every connector starts in
**Preview** mode:

| ID   | Example                     | Webhook path                        | Source                                                                                                    |
| ---- | --------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 4001 | Deployment status card      | `devx/deployment-status`            | [Deployment Status Notifications](../ci-cd/cd/deployment-status-notifications.md)                         |
| 4002 | DNS routing change card     | `devx/dns-routing-change`           | [DNS Probe](../platform/dns-probe.md)                                                                     |
| 4003 | n8n/PGO Grafana alert card  | `devx/grafana-alert`                | [Grafana Alert Notifications](../operations/grafana-alert-notifications.md)                               |
| 4004 | Custom Sysdig alert card    | `devx/sysdig-alert-card`            | [Sysdig Alert Notifications](../operations/sysdig-alert-notifications.md)                                 |
| 4005 | GitHub secret scanning card | `devx/github-secret-scanning-alert` | [GitHub Secret Scanning Alert Notifications](../operations/github-secret-scanning-alert-notifications.md) |

Template `4004` is the custom Code-node Adaptive Card flow, distinct from
template `2009`'s simpler **Template → Sysdig** transformation. Sysdig and
GitHub secret scanning use Header Auth; attach the credential after import.

Template `4005` must receive deliveries from a trusted receiver that validates
GitHub's signature against the original request bytes. Its formatter is not a
signature verifier. The template disables execution-data saving and its Code
node allowlists output metadata so `alert.secret`, comments, provider metadata,
and the original body do not flow to the connector. Follow the source runbook's
remaining access-control and logging precautions before using real deliveries.

The formatter tests execute each documented sample payload against the real
DevX connector in Preview mode and verify the Code-node scripts remain
identical to the source runbooks.

## Reload and validate

The image already contains these assets. Docker Compose also bind-mounts this
directory, so template-only changes only need:

```bash
cd docker-compose
docker compose restart n8n
```

Run the external-hooks tests after editing:

```bash
cd external-hooks
pnpm test tests/api/services/templates-library.test.ts tests/api/routes/templates.test.ts
```

The local browser is at `http://localhost:5678/templates/`, and the API root is
`http://localhost:5678/rest/custom/v1`.
