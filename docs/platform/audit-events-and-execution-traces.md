---
title: Audit Events and Execution Traces
sidebar_label: Audits and Traces
sidebar_position: 8
---

# Audit events and execution traces

This document assesses what Common Hosted Workflow (CHWF) can record using out-of-box n8n Log
Streaming and OpenTelemetry tracing. It defines the native events and spans, storage, retention,
query approach, integration points, and the gaps that remain without custom implementation.

## Version scope

The assessment uses:

- the n8n Log Streaming and OpenTelemetry documentation linked in the references;
- the n8n GitHub codebase.

## Capability summary

Audit events and traces serve different purposes:

| Record                    | Native source                | Best use                                                                      | Native store                                                                                |
| ------------------------- | ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| audit and lifecycle event | n8n Enterprise Log Streaming | User activity, configuration changes, workflow outcomes, and system lifecycle | n8n local delivery spool only; an external destination is required for searchable retention |
| execution trace           | n8n OpenTelemetry exporter   | Workflow and node timing, outcome, errors, and distributed request flow       | None in n8n; an OTLP backend is required                                                    |

For CHWF, the selected external stores are Loki for streamed events and Tempo for traces. This
is the selected architecture, not the deployment state of every environment.

The complete path is currently enabled in the primary `c89a45` Gold development overlay. The
same overlay's production and test values define backend settings but leave Alloy, Loki, Tempo,
and Grafana disabled; OpenTelemetry also inherits its disabled base default. In those
environments, n8n has no deployed Alloy destination for the configured syslog stream and does
not export traces. Other primary and DR overlays must be assessed individually before claiming
that collection or query is available.

### Acceptance criteria assessment

| Criterion                                       | Out-of-box n8n status       | Assessment                                                                                                                                                    |
| ----------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit events define who, what, when, and why    | Partial                     | `eventName` and resource fields describe what; `ts` describes when; actor and reason depend on the event. There is no universal business-justification field. |
| Events include `tenant_id`, user, and timestamp | Not met                     | Every event has `ts`. Some events have `userId` and related fields. n8n emits no CHWF `tenant_id`; some workflow events have an n8n `projectId`.              |
| Storage solution defined                        | Defined                     | Stream events through syslog and Alloy to Loki; send OTLP traces through Alloy to Tempo. Both use S3-compatible object storage when enabled.                  |
| Retention policy defined                        | Defined, not fully enforced | Baseline is 90 days in production and 30 days in non-production. Current Helm gaps are documented below.                                                      |
| Access/query approach defined                   | Partial                     | Grafana, LogQL, and TraceQL provide queries. Native CHWF deployment does not yet enforce tenant-scoped access to Loki or Tempo.                               |
| Integration points identified                   | Met                         | n8n UI/API actions, workflow executions, nodes, triggers, queue/workers, authentication, role mapping, and cluster events are identified below.               |

The original field requirement cannot be satisfied by out-of-box n8n alone. In particular,
`tenant_id` is not an n8n concept and user attribution is intentionally absent for automated
executions and system events. External enrichment or custom event production would be required
to make those fields universal, but that implementation is outside this document's scope.

## Native Log Streaming events

Log Streaming is an n8n Enterprise feature. n8n can send selected event groups to a syslog
server, generic webhook, or Sentry destination.

### Native event envelope

All streamed events inherit this envelope:

```json
{
  "id": "0c11cac3-7dc0-498f-a2f1-cfecba2cf8f9",
  "ts": "2026-08-20T09:18:16.634-07:00",
  "eventName": "n8n.audit.workflow.executed",
  "message": "n8n.audit.workflow.executed",
  "payload": {}
}
```

| Field       | Native behavior                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`        | UUID generated for the event. Use it to identify the event and handle possible duplicate delivery.                         |
| `ts`        | Event creation time serialized as ISO 8601. This is the authoritative event timestamp.                                     |
| `eventName` | Stable dotted event name describing the action or lifecycle transition.                                                    |
| `message`   | Defaults to the event name. It is not a separate explanation or business reason.                                           |
| `payload`   | Event-specific fields. Actor, project, workflow, execution, reason, and outcome fields are not uniform across event types. |

n8n has an internal `__type` event-class field, but its syslog destination deletes that field
before transmission. The current Alloy `event_type` extraction therefore has no value for native
syslog events. Event family must be derived from `eventName`.

### Who, what, when, and why

| Question | Native source                                                                                                                                       | Coverage and limitation                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Who      | Usually `payload.userId`; redactable actor details use `_email`, `_firstName`, `_lastName`, and `globalRole`; some events use other identity fields | Present for many interactive audit events. Optional for workflow execution and absent for webhook, schedule, worker, queue, and cluster events. Field names vary for initiator and target users. |
| What     | `eventName` plus identifiers such as `workflowId`, `executionId`, `credentialId`, `variableId`, or `instanceKey`                                    | Strongest part of the native contract. Payload shape still varies by event.                                                                                                                      |
| When     | Top-level `ts`; some events add a domain timestamp such as `responseAt`                                                                             | Present on every native event. Preserve the offset or normalize to UTC at query time.                                                                                                            |
| Why      | Event-specific fields such as execution `source`, `mode`, cancellation `reason`, `resumeSource`, `rejectionReason`, or changed settings             | Only a technical cause where n8n knows one. Most create/update/delete events contain no business justification. `message` does not add a reason.                                                 |

For native n8n events, “why” therefore means the available technical trigger or failure reason,
not a universal business rationale.

### Event families

The following families are available in current n8n documentation or the 2.36.0 source. Exact
events vary by n8n version and licensed features.

| Family                          | Representative events                                                                                    | Useful native fields                                                                                 | Attribution gaps                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Authentication and users        | Login success/failure, signup, update, deletion, invitation, reset, MFA, and API key lifecycle           | User identity when known, authentication method, changed fields                                      | Failed login may not resolve to a user; no tenant/project context                                            |
| Credentials                     | Created, shared, updated, deleted, authorization rejected                                                | User and credential identifiers/type; rejection information for rejected authorization               | Project context is not guaranteed; no business reason                                                        |
| Workflows                       | Created, updated, deleted, archived, activated, deactivated, version updated, executed, waiting, resumed | User on interactive changes; workflow and execution identifiers; trigger `source` on executed events | Create/update/delete payloads do not consistently include `projectId`; automated executions may have no user |
| Variables                       | Created, updated, deleted                                                                                | User and variable identifiers/key                                                                    | No tenant ID; reason is not captured                                                                         |
| Packages                        | Community package lifecycle and n8n package import/export                                                | User, package, operation, success/failure details                                                    | Instance-scoped rather than tenant-scoped in many cases                                                      |
| External secrets                | Provider and connection saved, created, updated, deleted, tested, reloaded                               | Provider/connection-specific payload                                                                 | User and project attribution are not uniform                                                                 |
| Security policy                 | Personal publishing/sharing restriction, 2FA enforcement, redaction enforcement                          | Acting user for supported changes and before/after values where emitted                              | Platform-scoped; no tenant ID                                                                                |
| Execution data reveal           | Reveal success and failure                                                                               | User, execution, workflow, IP address, user agent, policy, rejection reason                          | Sensitive event; no native tenant ID                                                                         |
| Token exchange and role mapping | Exchange success/failure, identity link, provisioning, role updates, role mapping rules                  | Subject/client, provider, resolved roles, and outcome depending on event                             | Payloads vary; not every event has one initiating human                                                      |
| Workflow lifecycle              | `n8n.workflow.started`, `success`, `failed`, `cancelled`                                                 | Project, workflow, execution, mode, result, last node, and error details where available             | User is optional; cancellation lacks project/user in current source                                          |
| Node lifecycle                  | `n8n.node.started`, `n8n.node.finished`                                                                  | Workflow, execution, node ID/name/type                                                               | No project or user in the native node payload                                                                |
| Queue and workers               | Queue job enqueued/dequeued/completed/failed/stalled; worker started/stopped                             | Job, execution, workflow, and host identifiers depending on event                                    | System events with no user or tenant                                                                         |
| Cluster                         | Instance joined/left, version mismatch, host-ID clash, and split-brain detection/resolution              | Host, instance role/type, version, and check-specific details                                        | System events with no user, project, or tenant                                                               |
| MCP and workflow review         | MCP OAuth/access/tool activity and workflow review lifecycle when those features are enabled             | User, workflow, version, review, or client context depending on event                                | Version and feature dependent; verify before relying on fields                                               |

The CHWF Helm subscription currently selects `n8n.audit`, `n8n.workflow`, `n8n.node`,
`n8n.queue`, and `n8n.worker`. The broad `n8n.audit` subscription includes new audit events
introduced by an upgraded n8n version, so dashboards and security review must account for schema
changes.

### Tenant, user, and timestamp feasibility

| Required value | Native n8n field                                         | Feasibility                                                                                                    |
| -------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| timestamp      | top-level `ts`                                           | Available for every event                                                                                      |
| user           | commonly `payload.userId`, with optional identity fields | Available only when n8n knows an actor; not a universal field                                                  |
| n8n project    | `payload.projectId` and sometimes `projectName`          | Available on workflow execution/lifecycle events, but not all workflow audit events and not node/system events |
| CHWF tenant    | none                                                     | Not available out of the box                                                                                   |

CHWF maps tenants to n8n projects, but n8n does not read that mapping and cannot emit
`tenant_id`. Even using `projectId` as a proxy is incomplete because it is absent from some
events. A dashboard filter on `projectName` is neither complete nor an authorization boundary.

### Supplied event interpretation

The supplied workflow execution event contains:

- **who:** unavailable because a webhook initiated the execution and no `userId` was emitted;
- **what:** workflow `xryN5xsAxhcBqJyI`, execution `2655`, in project
  `HvYR5DJN15uVjXpe`;
- **when:** `2026-08-20T09:18:16.634-07:00`;
- **why:** technical source `webhook`;
- **outcome:** unavailable in this event. Use the corresponding workflow success, failure, or
  cancellation event.

The supplied `n8n.audit.cluster.instance-joined` event is platform-scoped. Its actor is the n8n
cluster subsystem, and its purpose is to record that a webhook processor instance joined. It has
no meaningful user, project, or tenant.

## Native OpenTelemetry traces

OpenTelemetry tracing is a Preview n8n feature. n8n exports traces using OTLP over HTTP with
Protobuf encoding. It appends `/v1/traces` to the configured base endpoint by default.

### Span model

| Span               | Cardinality                                    | Native attributes                                                                                                  |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `workflow.execute` | One per workflow execution segment             | Workflow ID/name/version/node count, project ID when known, execution ID/mode/status, retry fields, and error type |
| `node.execute`     | One child span per node execution when enabled | Node ID/name/type/version, input/output item counts, termination reason, and exception event on failure            |

Resource attributes identify the emitting n8n process:

- `service.name` and `service.version`;
- `n8n.instance.id`;
- `n8n.instance.role` such as main, worker, or webhook.

### Trace context propagation

n8n supports these native integration points:

- inbound webhook requests can continue a W3C `traceparent` context;
- HTTP Request nodes and nodes using n8n HTTP helpers can inject outbound `traceparent` and
  `tracestate` headers;
- sub-workflows continue the parent workflow trace;
- resumed wait executions link to the earlier execution segment using a span link;
- queue-mode processes propagate trace context when tracing is enabled consistently on main,
  worker, and webhook processes.

### Trace attribution gaps

- Traces contain `n8n.project.id`, not CHWF `tenant_id`.
- Workflow and node spans do not include a general authenticated-user attribute.
- Traces record execution mode, status, retry context, and errors, but not a business
  justification.
- Sampling can omit entire traces. Audit records must not depend on traces being present.
- Exporter or collector outages can lose spans after in-memory queues fill.
- Log Streaming events do not natively include the OpenTelemetry trace ID. Correlate logs and
  traces using `executionId`/`n8n.execution.id` and workflow ID where available.

### Trace data protection

- Do not add credentials, tokens, authorization headers, personal data, or workflow payloads as
  custom span attributes.
- Node failures can record exception type, message, and stack trace. Treat Tempo as potentially
  sensitive operational storage.
- Agent tracing can record prompts, tool arguments, responses, and results by default. Set
  `N8N_AGENTS_TRACING_RECORD_INPUTS=false` and
  `N8N_AGENTS_TRACING_RECORD_OUTPUTS=false`, or disable agent tracing, unless that content has
  been reviewed and approved.

## Collection and storage

### Streamed events

The selected CHWF path uses only n8n's native syslog destination and the existing observability
stack:

```text
n8n Log Streaming -> syslog/TCP :5514 -> Alloy -> Loki -> S3-compatible storage
```

Alloy parses the native JSON envelope, uses `ts` as the log timestamp, and extracts labels for
event name/type, workflow, project name, and execution mode. The raw JSON remains the log body.
No tenant enrichment or event reshaping occurs.

n8n first persists each emitted event to a local per-process event file and can re-emit unsent
events. This file is a delivery/recovery spool, not long-term audit storage. When multiple n8n
processes share a writable filesystem, configure a unique
`N8N_EVENTBUS_LOGWRITER_LOGFULLPATH` for each process to prevent file corruption. Recovery can
produce duplicates, so exact-count exports should deduplicate using event `id`.

Current transport gaps:

- the CHWF syslog configuration uses plaintext TCP rather than native syslog TLS;
- the listener has no producer authentication and binds to `0.0.0.0:5514`;
- `anonymizeAuditMessages` is disabled so actor details remain queryable;
- NetworkPolicy can restrict reachability but does not provide transport encryption or sender
  identity.

n8n supports a TLS syslog destination with a CA certificate out of the box. Using it still does
not add tenant or user fields to events that lack them.

### Traces

```text
n8n main/worker/webhook -> OTLP/HTTP :4318 -> Alloy -> Tempo -> S3-compatible storage
```

Set the OpenTelemetry variables on every n8n process type in queue mode. The endpoint is the
collector base URL, not the `/v1/traces` path. The current Alloy receiver accepts unencrypted
cluster-internal HTTP; use network isolation and evaluate TLS/authentication requirements for
the collector path.

### Storage decision

| Data                        | Selected system                         | Rationale                                                                         |
| --------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| Native Log Streaming events | Loki with S3-compatible object storage  | Existing CHWF log pipeline, LogQL, Grafana dashboards, and retention support      |
| Native OpenTelemetry traces | Tempo with S3-compatible object storage | OTLP compatibility, TraceQL, Grafana trace views, and workflow/node span analysis |
| n8n execution history       | PostgreSQL                              | Native n8n execution records; separate from audit logs and traces                 |

Loki is operational log storage, not inherently immutable or tamper-evident. Requirements for
legal hold, write-once retention, or independent security custody would require an external
system and are not met by the selected out-of-box path.

## Retention policy

| Record                               | Production                  | Development/test            | Enforcement point                  |
| ------------------------------------ | --------------------------- | --------------------------- | ---------------------------------- |
| Native streamed events in Loki       | 90 days                     | 30 days                     | Loki compactor retention           |
| Native OpenTelemetry traces in Tempo | 90 days                     | 30 days                     | Tempo retention/compactor          |
| n8n event delivery spool             | Recovery only               | Recovery only               | n8n event file size/count settings |
| n8n execution history                | Separate application policy | Separate application policy | `EXECUTIONS_DATA_MAX_AGE`          |

The primary `c89a45` Gold overlays specify 90 days for production and 30 days for development
and test for Loki and Tempo. The `b0c13b` and Gold DR overlays do not consistently define these
overrides. Loki may inherit the 30-day base value, while Tempo has no equivalent base retention
policy.

Retention is not fully enforced in the current configuration:

- base Helm values set Loki `compactor.retention_enabled: false`, so
  `limits_config.retention_period` alone does not delete expired events;
- some production observability subcharts are disabled in environment values.

Align all environment overlays and enable and test backend compaction before treating the policy
as implemented. Do not use a broad object-store lifecycle rule as a substitute for Loki or Tempo
compaction; premature object deletion can corrupt backend data. Loki, Tempo, PostgreSQL execution
history, and the n8n event spool have independent retention controls.

## Access and query approach

### Human access

- Authorized platform operations and security/support users query native streamed events in the
  **n8n Logs** Grafana dashboard or Grafana Explore.
- Authorized platform operations users inspect traces through the **n8n Traces** dashboard and
  Tempo Explore.
- Tenant workflow-author access is not safe until server-side tenant/project query enforcement
  exists. Dashboard variables are filters, not access controls.

Example LogQL queries against the current native payload:

```logql
{job="n8n-log-streaming", event_name=~"n8n.audit.*"}
```

```logql
{job="n8n-log-streaming"}
  | json project_id="payload.projectId", user_id="payload.userId"
  | project_id="<n8n-project-id>"
```

Example TraceQL query:

```traceql
{ span.n8n.project.id = "<n8n-project-id>" && span.n8n.execution.id = "2655" }
```

### Native access limitations

- Loki and Tempo do not understand CHWF's tenant-to-project mapping.
- The current Grafana datasources query Loki and Tempo directly.
- A user-supplied project or workflow filter does not prevent a cross-project query.
- Events without `projectId` cannot be isolated by project, even at query time.
- n8n does not provide a tenant-aware audit-query API over Log Streaming data.
- Direct Loki and Tempo API access must remain restricted to platform service accounts and
  authorized operators.

## Native integration points

| n8n integration point                                        | Native events or traces                                            | Available context                                                                       | Missing context                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| User login and account administration                        | `n8n.audit.user.*`                                                 | User/attempted identity, method, action, timestamp depending on event                   | Tenant and often business reason                   |
| Workflow create/update/delete/activate                       | `n8n.audit.workflow.*`                                             | User, workflow, changed settings/version depending on event                             | Project on several events, tenant, business reason |
| Manual or retry execution                                    | `n8n.audit.workflow.executed`, workflow lifecycle, execution trace | User when available, source, project, workflow, execution, outcome from lifecycle event | Tenant and shared trace ID in logs                 |
| Webhook, schedule, error, CLI, chat, or integrated execution | Workflow audit/lifecycle events and execution trace                | Technical source/mode, project, workflow, execution                                     | Human user in most automated cases, tenant         |
| Node execution                                               | Node lifecycle events and `node.execute` spans                     | Workflow, execution, node identity/type, duration, errors                               | User, tenant, and project in native node events    |
| Wait and resume                                              | Waiting/resumed audit events and linked traces                     | Workflow/execution, resume source/time, span link                                       | User, project on audit event, tenant               |
| Queue and worker processing                                  | `n8n.queue.*`, `n8n.worker.*`                                      | Job/execution/workflow/host depending on event                                          | User, tenant, and often project                    |
| Authentication, token exchange, and role mapping             | Audit events                                                       | Subject/client/provider/roles/outcome depending on event                                | Uniform actor and tenant contract                  |
| Cluster checks and instance lifecycle                        | `n8n.audit.cluster.*`                                              | Instance, host, role, version, detected condition                                       | User, project, and tenant by design                |
| Inbound/outbound HTTP                                        | W3C trace context                                                  | `traceparent`/`tracestate` and execution spans                                          | Audit actor or tenant unless separately present    |

## Validation checklist

1. Stream a human workflow update and record the exact actor, workflow, timestamp, project, and
   reason fields that the deployed n8n version emits.
2. Trigger the workflow manually, by webhook, and by schedule; verify which executions include
   `userId`, `projectId`, and `source`.
3. Produce success, failure, cancellation, wait, and resume events and verify that final outcome
   must be reconstructed from the appropriate lifecycle event.
4. Confirm every event has `id`, `ts`, `eventName`, and `payload`, and that no native event has
   CHWF `tenant_id`.
5. Confirm one execution ID locates the related Loki events and Tempo trace.
6. Verify workflow and node spans contain the documented attributes in the deployed n8n version.
7. Restart a process or interrupt a destination, verify replay, and check for duplicate event
   IDs.
8. Verify unauthorized users cannot query Loki or Tempo directly or bypass Grafana restrictions.
9. Insert test data older than policy and verify Loki and Tempo physically remove it after
   compaction.
10. Inspect representative events, exceptions, and agent spans for credentials, tokens, prompts,
    personal information, and workflow data.

## Out-of-box gaps

| Gap                                            | Impact                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| No native CHWF `tenant_id`                     | The required tenant field cannot be emitted by n8n Log Streaming or workflow traces.                       |
| User is event-specific                         | Automated workflow, node, queue, worker, and cluster activity cannot be universally attributed to a human. |
| No universal reason                            | Most mutations show the action but not the user's business justification.                                  |
| Inconsistent `projectId`                       | Project-based filtering cannot cover all audit, node, and system events.                                   |
| No shared trace ID in streamed events          | Log-to-trace correlation relies primarily on execution and workflow IDs.                                   |
| No tenant-aware query boundary                 | Grafana variables and LogQL/TraceQL filters do not enforce tenant isolation.                               |
| Plaintext, unauthenticated current syslog path | Network controls reduce exposure but do not authenticate the sender or encrypt audit payloads.             |
| Retention configuration incomplete             | The stated policy is not consistently and demonstrably enforced across environments.                       |
| OpenTelemetry tracing is Preview               | Span behavior and configuration can change during n8n upgrades.                                            |
| Loki is not immutable audit storage            | Legal hold or tamper-evidence requirements are not met by the selected operational store.                  |

Out-of-box n8n therefore provides useful operational auditing and execution tracing, but it does
not satisfy a strict requirement that every event contain tenant, user, timestamp, and business
reason. Timestamp is universal; tenant, user, and reason are the material gaps.

## References

- [n8n observability research and POC findings](../research/observability.md)
- [Observability dashboards](../operations/observability-dashboards.md)
- [Tenant isolation model](./tenant-isolation-model.md)
- [n8n: Stream logs to external systems](https://docs.n8n.io/administer/observe-and-log/stream-logs-to-external-systems/)
- [n8n: Trace executions with OpenTelemetry](https://docs.n8n.io/deploy/host-n8n/keep-n8n-running/trace-executions-with-opentelemetry/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
