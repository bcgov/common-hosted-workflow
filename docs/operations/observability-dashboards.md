# n8n Observability Dashboards

Grafana provides two dashboards for monitoring n8n in Common Hosted Workflow. They are provisioned automatically — no manual import is needed.

| Dashboard          | Audience                     | Scope                                  |
| ------------------ | ---------------------------- | -------------------------------------- |
| **n8n Executions** | Workflow authors, team leads | Are my workflows running and how fast? |
| **n8n Health**     | Platform / ops team          | Is the n8n process itself healthy?     |
| **n8n Traces**     | Workflow authors, platform   | What happened inside a single run?     |

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

| Panel                   | What it shows                                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workflow Executions** | One row per workflow execution span. Columns: Trace ID, Start time, Retry, Mode, n8n Status, n8n workflow id, Workflow, Duration. Click the **Trace ID** to open the full span waterfall in Explore. |

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

| Attribute                  | Value                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| `n8n.workflow.name`        | Workflow name                                                       |
| `n8n.workflow.id`          | n8n internal workflow ID                                            |
| `n8n.execution.id`         | Execution ID (matches n8n UI and logs)                              |
| `n8n.execution.mode`       | Trigger type: `manual`, `webhook`, `trigger`, `retry`               |
| `n8n.execution.status`     | `success`, `error`, or `waiting`                                    |
| `n8n.execution.error_type` | Error class name when status is `error` (e.g. `NodeOperationError`) |
| `n8n.execution.is_retry`   | `true` when the execution is a manual retry of a previous failure   |
| `n8n.execution.retry_of`   | Execution ID of the original failed run, when `is_retry` is `true`  |
| `n8n.project.id`           | n8n project ID (for multi-tenant filtering)                         |
| `n8n.node.name`            | Display name of the node (node spans only)                          |
| `n8n.node.type`            | Node type identifier, e.g. `n8n-nodes-base.httpRequest`             |

---

## How metrics and traces reach Grafana

```
n8n /metrics  →  Alloy (scrapes every 30 s)  →  Mimir  →  Grafana
n8n OTLP      →  Alloy (OTLP receiver :4318)  →  Tempo  →  Grafana
```

---

## Known limitations

**Avg Processing Time ≠ wall-clock execution time**
The duration panels measure n8n's internal node execution time only. Time spent waiting on external HTTP calls, databases, or APIs is not included. The n8n UI's "Succeeded in Xs" figure reflects total wall-clock time and will typically be higher.

**Counters reset on restart**
SSO counters are in-memory and reset to zero when n8n restarts. Time-series charts preserve history in Mimir; only the stat panels reset.

**Metrics scrape interval is 30 seconds**
Short-lived executions that complete between scrapes contribute to histogram buckets but may not appear as a visible spike in rate-based time series charts over very short time windows.
