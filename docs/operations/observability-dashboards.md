# n8n Observability Dashboards

Grafana provides dashboards for monitoring n8n in Common Hosted Workflow. They are provisioned automatically — no manual import is needed.

| Dashboard           | Audience                     | Scope                                         |
| ------------------- | ---------------------------- | --------------------------------------------- |
| **n8n Executions**  | Workflow authors, team leads | Are my workflows running and how fast?        |
| **n8n Health**      | Platform / ops team          | Is the n8n process itself healthy?            |
| **n8n Traces**      | Workflow authors, platform   | What happened inside a single run?            |
| **n8n Logs**        | Platform / ops team          | What failed, who changed what, audit trail?   |
| **n8n System Logs** | Platform / ops team          | What did the n8n pods print to stdout/stderr? |

---

## Accessing Grafana

| Environment   | URL                                     | Auth                                                           |
| ------------- | --------------------------------------- | -------------------------------------------------------------- |
| Local sandbox | `http://localhost:3000`                 | SSO via Keycloak, or `admin` / `admin` when running standalone |
| Dev / prod    | Grafana route configured in Helm values | SSO via Keycloak                                               |

Both dashboards are in the **n8n** folder in Grafana's left sidebar.

---

## n8n Executions

Tracks workflow execution activity — use it to verify workflows are running, spot failures, and understand duration trends.

### Filters

**Execution Type** — filters all panels to a specific trigger type: All, Webhook, Scheduled, or Manual.

**Workflow** — filters all panels to a specific workflow by name. Defaults to All.

### KPI panels

| Panel                   | What it shows                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Total Executions**    | Number of executions completed in the selected time range                                                            |
| **Successful**          | Count of executions that completed successfully                                                                      |
| **Failed**              | Count of executions that failed — background turns red when non-zero                                                 |
| **Success Rate**        | Successful executions as a percentage of total                                                                       |
| **Executions / min**    | Average throughput over the selected time range                                                                      |
| **Avg Processing Time** | Mean n8n internal processing time per execution — does not include time spent waiting on external APIs or HTTP calls |

### Charts

| Panel                                            | What it shows                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Executions Over Time**                         | Execution rate over time, split by status — use to correlate failure spikes with deploys or external events                                    |
| **Executions by Status**                         | Total successes vs failures for the selected time range as a bar chart                                                                         |
| **Execution Stats — Breakdown by Type & Status** | Table of execution counts by workflow, trigger type, and status                                                                                |
| **Execution Duration — p50 / p90 / p99**         | Distribution of n8n processing times — p50 is the median, p99 is the slowest 1%. A wide gap between p50 and p99 means occasional slow outliers |
| **Average Execution Duration Over Time**         | Rolling mean processing time over time — complements the percentile chart                                                                      |

---

## n8n Health

Monitors the n8n process itself. Use this to catch memory leaks, CPU saturation, and event loop pressure before they affect workflow execution.

### Instance overview (top row)

| Panel                          | What it shows                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Active Workflows**           | Workflows currently active with triggers registered — an unexpected drop to 0 means workflows were deactivated or failed to re-register after a restart |
| **Total Workflows**            | Total number of workflows in n8n regardless of active state                                                                                             |
| **All-time Executions**        | Cumulative count of production (non-manual) executions since n8n started                                                                                |
| **All-time Manual Executions** | Cumulative count of manual test executions since n8n started                                                                                            |

### Process health KPIs

| Panel                     | What it shows                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Heap Used**             | V8 JavaScript memory currently in use — a value that rises steadily without recovering signals a memory leak               |
| **Heap Total**            | Total V8 heap capacity allocated — should always be comfortably above Heap Used                                            |
| **Resident Memory (RSS)** | Total RAM consumed by the n8n process as seen by the OS, including heap and native buffers                                 |
| **Event Loop Lag (p99)**  | How long callbacks wait before n8n processes them — sustained lag above 50 ms means n8n cannot accept new work fast enough |
| **CPU Usage**             | CPU consumed by the n8n process — sustained usage above 80 % correlates with rising event loop lag                         |
| **Open File Descriptors** | Count of open sockets and file handles — a steadily increasing value without rising throughput signals a handle leak       |

### Process health charts

| Panel                                     | What it shows                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Heap Memory Over Time**                 | Heap Used and Heap Total overlaid — a narrowing gap that never recovers is the clearest indicator of a heap leak                        |
| **Event Loop Lag Over Time**              | p50 / p90 / p99 lag over time — all three rising together indicates sustained load; only p99 rising indicates occasional slow callbacks |
| **CPU Usage Over Time**                   | User CPU (JavaScript execution) and System CPU (OS I/O) as separate lines — high System CPU with normal User CPU suggests I/O pressure  |
| **Garbage Collection Duration Over Time** | Time spent in GC per second and GC cycle frequency — long GC pauses appear as spikes in Event Loop Lag                                  |

### SSO panels

| Panel                             | What it shows                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Token Exchanges**               | Cumulative SSO token exchange requests — spikes with no user traffic increase can indicate an auth loop                            |
| **JIT Provisioned Users**         | Users auto-created on first SSO login — increments each time a new user logs in via Keycloak for the first time                    |
| **Identities Linked**             | SSO identity links created — increments when an existing local account is connected to an SSO provider for the first time          |
| **Token Exchange Rate Over Time** | Rolling rate of token exchange requests — a rate that doesn't drop during off-peak hours suggests a client stuck in a refresh loop |

### Queue Health

These panels show data in **dev and production** where n8n runs in queue mode with Redis and separate worker replicas. They will show no data in the local sandbox (docker-compose), which runs in single-process mode.

| Panel                     | What it shows                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Waiting Jobs**          | Jobs queued in Redis waiting for a free worker — a rising value means workers can't keep up and more replicas are needed                   |
| **Active Jobs**           | Jobs currently being executed across all worker pods                                                                                       |
| **Failed Jobs**           | Jobs that exhausted all retries — should always be 0                                                                                       |
| **Delayed Jobs**          | Jobs scheduled for future execution, such as retry backoff or scheduled triggers — expected to be non-zero if you have scheduled workflows |
| **Queue Depth Over Time** | Waiting, active, and failed job counts over time — Waiting rising while Active is flat at capacity means workers are saturated             |

### Cache

n8n caches workflow definitions and credentials in memory to avoid repeated database lookups.

| Panel                             | What it shows                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Cache Hit Ratio**               | Fraction of cache lookups served from memory vs going to the database — a low ratio means n8n is querying the DB more than expected |
| **Cache Hits & Misses Over Time** | Hit and miss rates per second — a sustained rise in misses without a matching rise in hits indicates cache pressure                 |

---

---

## n8n Traces

Shows individual workflow executions as distributed traces. Use it to inspect the internal span waterfall for a single run — which nodes executed, in what order, and how long each took.

Linked from the **Executions** dashboard: clicking a workflow name in the "Execution Stats — Breakdown by Type & Status" table opens the Traces dashboard pre-filtered to that workflow's ID.

### Filters

**Workflow** — workflow ID filter (default `.*` = all workflows). Populated automatically when navigating from the Executions dashboard. Can be manually replaced with a specific workflow ID to narrow results.

**Status** — All, Success, or Failed. Maps to the OpenTelemetry span status: `ok` for successful executions, `error` for failed ones.

### Panel

| Panel                   | What it shows                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workflow Executions** | One row per workflow execution span. Columns: Trace ID, Start time, Retry, Mode, n8n Status, Project, Workflow, Duration. Click the **Trace ID** to open the full span waterfall in Explore. |

### Trace structure

Span names are enriched by Alloy before storage — the workflow or node name is appended to make the waterfall readable:

| Span name (stored in Tempo)         | Description                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `workflow.execute: <workflow name>` | Root span for the entire execution. Status is `ok` or `error` based on outcome. |
| `node.execute: <node name>`         | Child span for each node that ran.                                              |

> **Note:** Because span names are enriched, exact-match TraceQL queries like `{name = "workflow.execute"}` return zero results. Use a prefix regex instead: `{name =~ "workflow.execute.*"}`.

**Sub-workflows** run inside the same trace as the parent — they do not create a separate trace. A sub-workflow's `workflow.execute` span is a child of the Execute Workflow node span in the parent, so both rows in the table will share the same Trace ID.

**Wait nodes** cause a different behaviour: n8n creates two separate traces linked via a SpanLink — one for the execution up to the Wait, one for the resume after the wait completes. Both are visible in the trace list as distinct rows.

### Key span attributes

| Attribute                  | Value                                                                           |
| -------------------------- | ------------------------------------------------------------------------------- |
| `n8n.workflow.name`        | Workflow name                                                                   |
| `n8n.workflow.id`          | n8n internal workflow ID                                                        |
| `n8n.execution.id`         | Execution ID (matches n8n UI and logs)                                          |
| `n8n.execution.mode`       | Trigger type: `manual`, `webhook`, `trigger`, `retry`                           |
| `n8n.execution.status`     | `success`, `error`, or `waiting`                                                |
| `n8n.execution.error_type` | Error class name when status is `error` (e.g. `NodeOperationError`)             |
| `n8n.execution.is_retry`   | `true` when the execution is a manual retry of a previous failure               |
| `n8n.execution.retry_of`   | Execution ID of the original failed run, when `is_retry` is `true`              |
| `n8n.project.id`           | n8n project ID — set automatically when the workflow belongs to a named project |
| `n8n.node.name`            | Display name of the node (node spans only)                                      |
| `n8n.node.type`            | Node type identifier, e.g. `n8n-nodes-base.httpRequest`                         |

### Project column

The **Project** column in the Workflow Executions table is populated from a custom span attribute set at the project level in n8n. It shows `—` for workflows that are not in a project or whose project has no custom attributes configured.

To populate the Project column:

1. In n8n, open the project the workflow belongs to.
2. Go to **Project settings → Custom Span Attributes**.
3. Add an attribute with key `name` and the project's display name as the value (e.g. `Analytics`).
4. Save.

All subsequent executions of workflows in that project will include `n8n.project.custom.name` in their traces.

> **Convention:** n8n prefixes project custom attributes with `n8n.project.custom.` — a key of `name` becomes the span attribute `n8n.project.custom.name`. Use `name` (not `project.name` or `n8n.project.name`) to match what the dashboard queries.

Executions that ran before the attribute was configured will continue to show `—`.

---

## n8n Logs

Provides an audit trail and failure analysis based on n8n log streaming events. Use it to investigate workflow failures, trace configuration changes, monitor user activity, and diagnose queue issues.

Linked from the **Executions** dashboard: clicking a workflow in the failure panels opens the Logs dashboard pre-filtered to that workflow.

Default time range: **last 15 minutes** — widen the time picker for historical investigation.

### Filters

| Filter       | Behaviour                                                                               |
| ------------ | --------------------------------------------------------------------------------------- |
| **Workflow** | Scopes all execution and audit panels to a single workflow by name. Defaults to All.    |
| **Project**  | Multi-select. Scopes execution panels to one or more projects.                          |
| **Event**    | Multi-select. Filters raw logs to specific event types (e.g. `n8n.workflow.failed`).    |
| **Mode**     | Multi-select. Filters execution panels by trigger mode: `manual`, `webhook`, `trigger`. |

### Live Health (top row)

| Panel                    | What it shows                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Failed Executions**    | Count of failed executions in the time range. First thing to check when a user reports a broken workflow.                                                            |
| **In-Flight Executions** | Executions started minus executions completed. A persistently positive value means workflows started but never finished — check for stuck or very long-running runs. |
| **Stalled Jobs**         | Queue jobs where the worker became unresponsive mid-execution. Any non-zero value warrants investigation. Queue mode only.                                           |

### Failures

| Panel                                       | What it shows                                                                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Failed Executions by Project & Workflow** | Table of failure counts grouped by project, workflow, and the last node executed before failure to help identify where workflows commonly fail. Click any row to filter the entire dashboard to that workflow. |
| **Recent Workflow Failures**                | Raw log lines for each failure — expand a line to see the full error message, execution ID, and node context.                                                                                                  |
| **Top Error Messages**                      | Most common failure error messages grouped by workflow. The same message appearing across multiple workflows points to a shared dependency (e.g. an external API down) rather than isolated bugs.              |

### Execution Overview

| Panel                         | What it shows                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workflow Events Over Time** | All four lifecycle events (started, success, failed, cancelled) on one chart. Started events exceeding completions indicate stuck executions. |

### Cancellations

| Panel                           | What it shows                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cancelled Executions**        | Count of manually stopped executions in the time range.                                                                                                                                                 |
| **Cancellation Rate**           | Cancelled executions as a percentage of all completed executions. Elevated values usually indicate manual cancellation or workflows configured to stop previous executions when a new execution starts. |
| **Failure Rate**                | Failed executions as a percentage of all completed executions.                                                                                                                                          |
| **Cancellations Over Time**     | Count of cancellation events over time — spikes often correlate with a specific workflow being triggered repeatedly and stopped manually.                                                               |
| **Recent Cancelled Executions** | Raw log lines for each cancellation — expand to see which workflow was stopped and the trigger mode.                                                                                                    |

### Audit & Security

| Panel                              | What it shows                                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audit Events**                   | Count of workflow configuration and user events in the time range. When a workflow is selected, shows only events for that workflow.                                                      |
| **Failed Login Attempts**          | Count of failed login attempts — repeated failures may indicate a credential attack or a misconfigured SSO client.                                                                        |
| **Workflow Configuration Changes** | Bar chart of workflow CRUD events over time (created, updated, activated, deactivated, archived, published, unpublished). Use to correlate execution behaviour changes with config edits. |
| **User Activity**                  | Bar chart of user login success/failure, signup and account deletions events.                                                                                                             |
| **Audit Log**                      | Raw audit event log lines. Expand each line to see who made the change, which workflow was affected.                                                                                      |

### Performance & Debug

| Panel                 | What it shows                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Most Active Nodes** | Table of node execution counts by node name, node type, and workflow. High counts on a single node reveal which external services are called most — Helps identify which integrations are used most frequently. |
| **Raw Logs**          | Full log stream filtered by all active dropdowns. Use this for ad-hoc investigation when the structured panels above don't show enough detail.                                                                  |

### Queue & Worker (queue mode only)

These panels show data only when n8n runs in queue mode. They will show no data in the local sandbox.

| Panel                | What it shows                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Queue Job Events** | Lifecycle events for each queue job: enqueued, dequeued, completed, failed, stalled. A gap between enqueued and dequeued indicates queue lag — insufficient worker capacity. |
| **Worker Events**    | Worker process start and stop events. A stopped event not followed by a started event means a worker went down and did not recover.                                          |

### Cross-dashboard navigation

- The **n8n Executions** link in the top-right navigates to the Executions dashboard, carrying the current time range and workflow filter.
- Clicking a row in **Failed Executions by Project & Workflow** filters the entire Logs dashboard to that workflow.
- Navigating from the Executions dashboard to Logs (via data links on failure panels) automatically sets the Workflow filter.

---

## n8n System Logs

Shows raw pod stdout/stderr from all n8n components — main, worker, webhook, and runner. Use this for infrastructure-level debugging: process crashes, startup errors, runner lifecycle events, and anything the application prints outside of structured log streaming.

> **Availability:** This dashboard requires `systemLogs.enabled: true` in Helm values and is only available in OpenShift environments. It will show no data in the local docker-compose sandbox, which has no Kubernetes API for Alloy to read from.

Default time range: **last 1 hour** — widen the time picker for historical investigation.

### Filters

| Filter        | Behaviour                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------- |
| **Component** | Filters all panels to a specific n8n container: main, worker, webhook, or runner. Defaults to All. |
| **Pod**       | Filters all panels to a specific pod. Useful when debugging a specific crashed or misbehaving pod. |

### KPI panels

| Panel               | What it shows                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Total Log Lines** | Count of all log lines from selected pods in the time range. Turns red on zero — a pod that stops logging has likely crashed or been evicted. |
| **Error Lines**     | Lines matching error keywords (error, exception, fatal, panic). Green at zero, orange at 1+, red at 10+.                                      |
| **Warn Lines**      | Lines matching warn keywords. Warnings often precede errors — a spike here before an error spike is a useful leading indicator.               |
| **Error Rate**      | Error lines as a percentage of total output. A persistently high ratio indicates a component in a bad state.                                  |

### Charts

| Panel                           | What it shows                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Log Volume by Component**     | Log line throughput per container over time. A gap in a line means that container produced no output — abnormal for main/worker.                                  |
| **Errors & Warnings Over Time** | Error and warn line counts over time, colour-coded red and orange by severity. Correlate spikes with the workflow execution timeline in the Executions dashboard. |
| **Error Lines**                 | Raw log lines matching error keywords, most recent first. Expand each line for full JSON context and pod label.                                                   |
| **All System Logs**             | Full stdout/stderr stream for selected components, pretty-printed as JSON.                                                                                        |

### Cross-dashboard navigation

- The **n8n Logs** link navigates to the log streaming dashboard (audit trail and workflow failures), carrying the current time range.
- The **n8n Executions** link navigates to the executions dashboard, carrying the current time range.

---

## Grafana Alerting

Grafana evaluates provisioned alert rules and sends email notifications to the responsible
team. Alert rules, contact points, notification policies, and email templates are managed in
Git and provisioned by Helm; they are locked against editing in the Grafana UI.

### Team routing

Every alert rule includes a `team` label. Grafana routes notifications using that label:

| Team label  | Recipient contact point | Alert scope                            |
| ----------- | ----------------------- | -------------------------------------- |
| `platform`  | `n8n-ops-email`         | n8n platform and infrastructure health |
| `workflows` | `n8n-workflows-email`   | Workflow execution failures            |

The recipient addresses are supplied to Grafana through the deployment secret rather than
stored in Git. Notifications are grouped by Grafana folder and alert name, wait 30 seconds
before the first notification, and repeat every four hours while an alert remains firing.

### System-log alerts

The following rules query the `n8n-system-logs` Loki stream and route to the `platform` team:

| Alert                                | Condition                                                                                                            | Evaluation                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **System Error Detected**            | An unstructured log line contains `error`, `exception`, `fatal`, or `panic`; workflow execution events are excluded. | More than zero errors for one minute |
| **System Structured Error Detected** | A non-workflow n8n component emits a structured error-level message.                                                 | More than zero errors for one minute |
| **System Warnings Elevated**         | More than 10 non-execution warning lines are emitted.                                                                | Sustained for five minutes           |

System-error emails include recent matching error messages and a link to the **n8n System
Logs** dashboard around the alert time. Workflow alerts instead link to the **n8n Executions**
dashboard and can include failed-workflow counts.

### Adding a team route

To send a class of alerts to another team, add an email contact point, supply its recipient
address through the deployment secret, add a matching `team` route in the notification policy,
and label the relevant alert rules with that team value. Keep the contact point, policy, and
rule label in sync: an unmatched team label falls back to Grafana's default receiver.

---

## How metrics, traces, and logs reach Grafana

```
n8n /metrics           →  Alloy (scrapes every 30 s)          →  Mimir  →  Grafana
n8n OTLP               →  Alloy (OTLP receiver :4318)         →  Tempo  →  Grafana
n8n log streaming      →  Alloy (syslog TCP :5514)            →  Loki   →  Grafana
n8n pod stdout/stderr  →  Alloy (loki.source.kubernetes)      →  Loki   →  Grafana
```

---

## Known limitations

**Avg Processing Time ≠ wall-clock execution time**
The duration panels measure n8n's internal node execution time only. Time spent waiting on external HTTP calls, databases, or APIs is not included. The n8n UI's "Succeeded in Xs" figure reflects total wall-clock time and will typically be higher.

**Counters reset on restart**
SSO counters are in-memory and reset to zero when n8n restarts. Time-series charts preserve history in Mimir; only the stat panels reset.

**Metrics scrape interval is 30 seconds**
Short-lived executions that complete between scrapes contribute to histogram buckets but may not appear as a visible spike in rate-based time series charts over very short time windows.

**Log metric panels lag raw log panels by 10–30 seconds**
Stat and table panels on the Logs dashboard (Failed Executions count, Top Error Messages, etc.) use aggregated Loki metric queries that go through Loki's result cache. Raw log panels (Recent Failures, Audit Log, Raw Logs) query the store directly and update immediately. The gap closes on the next dashboard refresh cycle.

**New workflows don't appear in the Workflow dropdown immediately**
The Workflow filter is populated from Loki label values. A newly created workflow only appears in the dropdown after it has generated at least one log streaming event (e.g. a test run). Click the refresh icon next to the dropdown to force a reload.

**User login events are not filterable by workflow**
`n8n.audit.user.*` events carry no workflow context. They appear only when the Workflow filter is set to All. Filtering to a specific workflow will hide all login and signup events.

**Queue and worker panels show no data in single-process mode**
The Queue Job Events and Worker Events panels only receive data when n8n runs in queue mode. In the local docker-compose sandbox these panels will always be empty.

**`anonymizeAuditMessages` is disabled**
Audit log events include full user details to support accountability and investigation. Access to the Logs dashboard should be restricted to authorized platform and ops team members.

**System Logs Pod filter only lists pods active in the selected time range**
The Pod variable is populated from Loki label values within the current time window. Pods that crashed and produced no logs in the selected range will not appear in the dropdown — widen the time range if you need to find a pod that died before the current window.

**System Logs not available in the local sandbox**
The docker-compose environment has no Kubernetes API. `loki.source.kubernetes` requires OpenShift — the dashboard will be empty when running locally.
