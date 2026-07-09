# n8n Observability — Research & POC Findings

## Background

As adoption for Common Hosted Workflow (CHW) grows, platform administrators and tenant teams need visibility into workflow health, execution performance, and failure patterns. This document captures the research, options explored, architecture decisions, and open questions from the observability POC.

---

## Why Distributed Tracing for n8n

Before selecting tooling it is worth clarifying why distributed tracing is appropriate here.
A typical workflow looks like:

```
Trigger → Node A → Node B → Node C
```

The value of tracing for n8n is **intra-workflow visibility** — understanding what happened
inside a single execution:

- Which workflows fail and why?
- Which nodes are slow (HTTP Request timing out? SQL query taking 10 seconds)?
- Which API calls timeout?
- Which executions exceed SLA?
- How long does the whole workflow take versus individual nodes?

The goal is node-to-node visibility within a workflow execution.

---

## Observability Pillars

This implementation covers two of the three observability pillars. Grafana is the
visualization layer across both — it is not itself a pillar.

| Pillar     | Storage | Collection path                                                |
| ---------- | ------- | -------------------------------------------------------------- |
| **Logs**   | Loki    | n8n Log Streaming → syslog → Alloy `loki.source.syslog` → Loki |
| **Traces** | Tempo   | n8n OTLP push → Alloy `otelcol.receiver.otlp` → Tempo          |

**Metrics (out of scope for this POC):** n8n exposes a Prometheus-compatible `/metrics`
endpoint covering execution counts, active executions, and queue depth. Grafana cannot query
this endpoint directly — `/metrics` only exposes the current instant's values with no history.
A time-series storage layer is required: Prometheus scrapes the endpoint on a schedule,
accumulates the data, and Grafana queries Prometheus for historical graphs. This adds one
additional service but is otherwise straightforward. It is a natural addition to this stack
for capacity planning and alerting once the core pillars are stable.

---

## Selected Stack

| Component         | Role                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Grafana Alloy** | Telemetry pipeline — receives OTLP traces from n8n and Log Streaming events via syslog, forwards traces to Tempo and logs to Loki |
| **Grafana Tempo** | Distributed trace storage and TraceQL query capabilities consumed by Grafana                                                      |
| **Grafana Loki**  | Log storage for n8n Log Streaming events (workflow lifecycle and audit events)                                                    |
| **Grafana**       | Visualization layer — dashboards and alerting across logs and traces                                                              |

### Why this stack

- All components are from the Grafana ecosystem — consistent versioning, shared support model
- Native OpenTelemetry (OTLP) support — n8n's built-in OTLP exporter works without any adapter
- TraceQL — Tempo's query language enables span-level filtering, metrics-from-traces, and time-series analysis not possible in other trace backends
- Single visualization layer (Grafana) provides correlated views across logs and traces.
  Prometheus can be added later for metrics-based dashboards and alerting.

---

## How n8n Connects

n8n connects to Alloy via two separate paths. **Alloy is always the server — it does not poll n8n.**

```
n8n  →  OTLP/HTTP (port 4318)  →  Alloy  →  Tempo   (traces)
n8n  →  syslog/TCP (port 5514) →  Alloy  →  Loki    (Log Streaming events)
```

`chwf-alloy` is the Kubernetes service name for the Alloy pod. Alloy listens on both ports:

```alloy
// Path 1 — OTLP traces from n8n's built-in OpenTelemetry exporter
otelcol.receiver.otlp "default" {
  http { endpoint = "0.0.0.0:4318" }
  output {
    traces = [otelcol.exporter.otlp.tempo.input]
  }
}

```

### n8n environment variables for traces

```yaml
N8N_OTEL_ENABLED: 'true'
N8N_OTEL_EXPORTER_OTLP_ENDPOINT: 'http://chwf-alloy:4318'
N8N_OTEL_EXPORTER_SERVICE_NAME: 'chwf-n8n'
N8N_OTEL_TRACES_PRODUCTION_ONLY: 'true' # set false for dev/test
N8N_OTEL_TRACES_SAMPLE_RATE: '1.0' # send 100% to Alloy; Alloy does the filtering
N8N_OTEL_TRACES_INCLUDE_NODE_SPANS: 'true' # include per-node spans for node latency panels
```

### Decision: Include node spans?

Setting `N8N_OTEL_TRACES_INCLUDE_NODE_SPANS=true` means each node in a workflow produces its own span. This enables the "Slowest Node Types" panel and node-level debugging. The trade-off is higher span volume.

**Recommendation**: keep enabled unless volume becomes a storage concern.

---

## What Traces Contain

Each n8n workflow execution produces an OpenTelemetry trace. A trace is a tree of spans where:

- The root span represents the full workflow execution
- Child spans represent individual node executions within the workflow

### Custom span attributes (Enterprise - needs verification)

Teams can attach additional attributes to node spans via **Settings → Custom Span Attributes**.
n8n automatically prefixes them with `n8n.node.custom.`:

```
Key: customer_tier     Value: ={{ $json.customerTier }}   → n8n.node.custom.customer_tier
Key: response_status   Value: ={{ $response.statusCode }} → n8n.node.custom.response_status
```

See the Security section for PII restrictions on custom attributes.

---

## Options Explored

### Jaeger (considered, rejected)

Jaeger is a dedicated distributed tracing backend. It can replace Alloy + Tempo. n8n's documentation references it as a quick-start option.

### Why Tempo was selected over Jaeger

The primary CHW observability requirement is not only viewing individual workflow traces, but
also providing operational dashboards that analyze workflow execution behaviour over time:

- Workflow failure trends
- Execution volume
- Workflow latency percentiles
- Slow node identification
- Workflow performance analysis

Tempo provides native TraceQL querying and TraceQL metrics integration with Grafana. This
allows workflow-level metrics to be generated directly from trace data without introducing
additional metric extraction components.

| Dashboard Requirement                   | Tempo                                      | Jaeger                                                   |
| --------------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| Workflow execution count by outcome     | Native TraceQL metrics (`count_over_time`) | Requires additional metrics extraction pipeline          |
| Failed executions over time by workflow | Native TraceQL filtering and metrics       | Requires additional aggregation tooling                  |
| Workflow duration percentiles (p95/p99) | Native TraceQL metrics                     | Requires additional metric generation                    |
| Slowest node types                      | Query node-level spans using TraceQL       | Possible, but requires additional aggregation components |

### Jaeger capabilities considered

Jaeger provides several capabilities that are valuable in traditional distributed systems.
The following were considered during evaluation:

| Feature           | Jaeger capability                                      | Relevance to CHW                                                                                                       |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Trace comparison  | Supports comparing individual traces during debugging  | Useful for developers troubleshooting specific executions, but not required for platform dashboards                    |
| Adaptive sampling | Jaeger Collector supports adaptive sampling strategies | Useful for very high-volume tracing environments; CHW can achieve similar optimization using Alloy tail-based sampling |

### Platform comparison

| Capability             | Tempo                                         | Jaeger                                                         |
| ---------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Grafana integration    | Native Grafana datasource                     | Supported through Jaeger datasource plugin                     |
| Trace query language   | TraceQL                                       | Jaeger Query API                                               |
| Object storage support | Native S3-compatible object storage support   | Typically requires Elasticsearch, Cassandra, or Badger storage |
| Multi-tenancy          | Native tenant isolation using `X-Scope-OrgID` | Possible but requires additional architecture                  |
| Sampling               | OpenTelemetry Collector / Alloy processors    | Jaeger Collector processors                                    |

### Decision

Tempo was selected because the CHW observability requirements focus on **workflow execution
analytics**, not only trace inspection.

The dashboard requirements depend on extracting operational insights from n8n execution
traces, including:

- Execution success and failure trends
- Workflow duration analysis
- Node-level performance analysis
- Workflow filtering and tenant isolation

Using Tempo with Grafana provides these capabilities through native TraceQL queries and
trace-derived metrics. Using Jaeger would require additional components to extract metrics
from traces and would introduce additional complexity into the dashboard architecture.

Alloy remains the telemetry pipeline because it provides:

- OTLP ingestion from n8n
- Tail-based sampling
- Attribute filtering (for example, PII removal)
- Telemetry enrichment
- Fan-out to multiple observability backends

### SigNoz (considered, rejected)

SigNoz is an all-in-one OpenTelemetry observability platform built on ClickHouse.
It provides logs and traces with its own UI and can also support metrics.

**Service count comparison:**

| Grafana stack | SigNoz stack                        |
| ------------- | ----------------------------------- |
| Alloy         | SigNoz OTel Collector               |
| Tempo         | ClickHouse (storage for everything) |
| Loki          | SigNoz backend/query service        |
| Grafana       | —                                   |

**Cons**:

- ClickHouse introduces additional operational and resource overhead compared with the specialized storage model used by Tempo and Loki.
- Multi-tenancy is immature — significant gap for per-environment/per-project isolation
- TraceQL-equivalent panels would need to be rebuilt in a different query language

**Decision**: SigNoz remains a capable OpenTelemetry observability platform, but the Grafana stack provides a better fit for CHW's isolation, dashboard, and operational requirements.

### Elasticsearch (considered, rejected)

Elasticsearch was not selected because the CHW observability requirements are better aligned with a lightweight observability stack using Grafana, Tempo, Loki and Alloy.

---

## Log Streaming

n8n has an enterprise feature called **Log Streaming** that emits structured workflow events (started, succeeded, failed) to external destinations. This is **separate from stdout container logs** and is required for audit events (user logins, credential changes, workflow lifecycle) to appear in Grafana.

### Recommended path: Syslog → Alloy → Loki

**This path is proposed but not yet tested.** The exact syslog payload format emitted by n8n
Enterprise Log Streaming must be validated before this approach is confirmed.

### Alternative path:

If syslog is not suitable, the webhook destination requires an adapter because n8n's Log
Streaming sends its own JSON format, not Loki's push format. No existing Grafana stack
component accepts generic JSON webhooks.

**Three options for the adapter:**

**Option A — Vector (recommended)**

Vector is a lightweight log pipeline tool with a built-in HTTP source and Loki sink.

**Option B — Small custom service**
A tiny HTTP server that receives the POST, wraps it in Loki format, and forwards. Another service to maintain.

**Option C — Skip Log Streaming → Loki entirely**
Use Log Streaming only for alerting destinations (Sentry, Slack webhook) that accept arbitrary JSON.

**Note**: n8n Log Streaming is an Enterprise feature.

---

## Sampling Strategy

Sending every trace from n8n provides the most complete troubleshooting information, but
storing every successful execution can create unnecessary storage usage as workflow volume
increases.

**Recommendation:** Configure n8n to send 100% of traces to Alloy:

```yaml
N8N_OTEL_TRACES_SAMPLE_RATE: '1.0'
```

---

## Failure Modes

| Component down                      | Impact                                                                        | Recovery                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Alloy unavailable**               | n8n SDK buffers spans in memory briefly, retries, then drops.                 | Traces during the outage are lost if the outage is long. |
| **Tempo unavailable**               | Alloy queues traces in memory (configurable size), replays on Tempo recovery. | Traces buffered up to queue limit, then dropped.         |
| **Grafana unavailable**             | Dashboard inaccessible. Telemetry still collected normally.                   | No data loss.                                            |
| **Object storage (S3) unavailable** | Tempo and Loki ingestion fails after local WAL fills.                         | Critical — restore S3 access promptly.                   |
| **n8n restart**                     | In-memory OTel buffer lost (seconds of spans).                                | Minor — automatic on restart.                            |

### Configuring n8n's OTel buffer

n8n's OTel SDK has a built-in in-memory queue with retry. The default buffer is small — for
longer Alloy outages, spans will be dropped. Configure the timeout:

```yaml
OTEL_EXPORTER_OTLP_TIMEOUT: '10000' # 10 seconds before giving up on an export attempt
```

### Configuring Alloy's buffer for Tempo outages

Add retry and persistent queue to the Alloy Tempo exporter so Alloy holds traces when Tempo
is temporarily unavailable:

```alloy
otelcol.exporter.otlp "tempo" {
  client {
    endpoint = "tempo:4317"
    tls { insecure = true }
  }
  sending_queue {
    enabled    = true
    num_consumers = 10
    queue_size = 10000
  }
  retry_on_failure {
    enabled          = true
    initial_interval = "5s"
    max_interval     = "30s"
    max_elapsed_time = "5m"
  }
}
```

Tempo also has a **Write-Ahead Log (WAL)** — mid-flight data is protected across Tempo
pod restarts and replayed on startup.

---

## Caching

Three layers of caching are available:

### 1. Tempo tag cache (already tried in POC)

The nginx proxy injects a time range on tag/tag-value endpoints so Tempo queries backend
Parquet blocks. The Workflow dropdown is populated correctly without re-querying on every
panel load.

### 2. Grafana datasource query cache

Grafana has built-in datasource query caching. Enable per datasource in `datasources.yaml`:

Repeated dashboard loads hit Grafana's memory cache instead of querying Tempo directly.

### 3. Tempo's built-in search cache

Tempo caches recent search results internally. For `traceqlMetrics` queries, results are
computed once and reused for the same time window.

---

## Security — PII in Traces

Traces must not contain personally identifiable information. Risk areas in n8n:

- Custom span attributes added by teams (could accidentally include email addresses, customer IDs)
- Node names or workflow names that embed customer identifiers

**Policy**: No PII, credentials, JWT tokens, or authorization headers in trace attributes.

**Enforcement via Alloy** — strip before traces reach Tempo

---

## Dashboard

The POC dashboard (`n8n-overview`) is provisioned automatically by Grafana and covers:

| Section      | Panels                                                    | Data source          |
| ------------ | --------------------------------------------------------- | -------------------- |
| Health       | Execution errors, workflow duration, recent failures      | Tempo                |
| Activity     | Executions Over Time                                      | Tempo                |
| Executions   | Recent Workflow Runs (table, clickable trace links)       | Tempo                |
| Performance  | Duration p95, Error Rate trend, Throughput, Slowest Nodes | Tempo traceqlMetrics |
| Audit Events | User logins, credential changes, workflow created/deleted | Loki (Log Streaming) |

A **Workflow** dropdown at the top filters all panels to a single workflow.

---

## nginx Proxy (needed only if we need a per workflow filter within the dashboard)

nginx sits between Grafana and Tempo on port 8090.

### Tag autocomplete fix

Grafana's Tempo plugin calls `GET /api/v2/search/tags` with no time range, so Tempo only
returns intrinsic tags from the in-memory ingester and never includes span attributes like
`n8n.workflow.name`. The nginx proxy injects a 7-day time range via an njs script, causing
Tempo to query backend Parquet blocks and return all indexed attributes.

---

## Storage and Retention

### Backend recommendation

| Environment | Tempo                        | Loki                         |
| ----------- | ---------------------------- | ---------------------------- |
| Production  | S3-compatible object storage | S3-compatible object storage |

Tempo and Loki still needs a local PVC for its WAL even when using S3 for block storage.

Single S3 bucket with separate prefixes:

```
s3://chwf-observability/
  tempo/    ← trace blocks
  loki/     ← log chunks
```

### Retention policies

| Data                               | Recommended retention | Where configured                                 |
| ---------------------------------- | --------------------- | ------------------------------------------------ |
| n8n execution history (PostgreSQL) | 30 days               | `EXECUTIONS_DATA_MAX_AGE` on n8n                 |
| Loki logs                          | 30 days               | `retention_period` in loki-config.yaml           |
| Tempo traces                       | 7 days                | `compacted_block_retention` in tempo-config.yaml |

These are three independent settings. Traces have the shortest retention because they are high volume and most troubleshooting uses recent data.

**Execution pruning**: n8n stores execution history in PostgreSQL separately from OTLP traces.
Setting `EXECUTIONS_DATA_MAX_AGE` prunes the n8n database independently of Tempo — these are not the same data store and must be configured separately.

## OpenShift Deployment Requirements

Items commonly missed until deployment:

| Requirement           | Notes                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| **PVC for Tempo WAL** | Required even when blocks go to S3 — WAL is always local                      |
| **PVC for Loki WAL**  | Loki also has a WAL that requires a local PVC when using S3 for chunk storage |
| **Route / Ingress**   | Grafana needs an OpenShift Route with TLS termination                         |
| **NetworkPolicy**     | n8n → Alloy only; Alloy → Tempo, Loki; Grafana → all backends                 |
| **Resource limits**   | All pods need CPU/memory requests and limits for OpenShift quota compliance   |

---

## Full Architecture

```
                         dev/test/prod namespace

┌────────────────────────────────────────────────────────────┐
│                                                            │
│                                                            │
│  n8n ->  Alloy  ->  Tempo (S3 backend) ----------------|   │
│                 ->  Loki  (S3 backend)  ---------------|   │
│                                                        │   │
│  Grafana  <────────────────────────────────────────────┘   │
│  (single dashboard)                                        │
│                                                            │
└────────────────────────────────────────────────────────────┘

Data paths:

OTLP traces:       n8n → POST http://chwf-alloy:4318 → Alloy → Tempo
Log Streaming:     n8n → syslog tcp://chwf-alloy:5514 → Alloy → Loki
```

---

## Implementation Tickets

### 1 — Core Infrastructure

- Deploy Loki, Tempo, Alloy, Grafana
- Configure nginx Tempo proxy (if needed)

### 2 — n8n Configuration

- Enable OpenTelemetry tracing on all n8n instances
- Configure execution data pruning (`EXECUTIONS_DATA_MAX_AGE`)
- Configure Log Streaming syslog destination (Enterprise)

### 3 — Grafana Dashboards

- Health Overview section (error rate, active workflows, avg duration)
- Activity Timeline (executions over time, log volume by severity)
- Workflow Executions table (clickable trace IDs → flame graph)
- Performance Analysis section (traceqlMetrics panels)

### 4 — Multi-Tenancy and Access Control

- Confirm primary isolation boundary (project) — drives all other decisions in this story
- Choose and implement tenancy model (X-Scope-OrgID)
- Design and implement query frontend enforcement layer — proxy that reads Keycloak JWT claims and injects correct `X-Scope-OrgID` before queries reach Tempo/Loki (required for real isolation; Tempo does not authenticate callers)
- Configure Alloy to inject tenant identifier per environment
- Configure Grafana datasources locked to environment tenant
- Add `n8n.project.id` filter variable to dashboards
- Configure Keycloak → Grafana role mapping

### 5 — Storage and Retention

- Provision S3-compatible object storage bucket folder
- Configure Tempo and Loki S3 backends
- Define and document retention policies per data type

### 6 — Security

- Add PII stripping processor to Alloy pipeline
- Document permitted custom span attribute keys

### 7 — Documentation and Runbooks

- Runbook: checking Alloy pipeline health (Alloy UI at port 12345)
- Runbook: verifying traces are flowing end to end
- Runbook: what to do when Tempo or Loki is full
- Team guide: how to access Grafana, use the dashboard, add custom span attributes
- Team guide: how to query Tempo/Loki via API key

---

## Open Questions

| Question                                                               | Notes                                                                                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| What does n8n Enterprise Log Streaming actually send over syslog?      | Determines if `\| json` pipeline works or custom parsing is needed                                                                      |
| What is the primary isolation boundary — environment or project?       | Determines tenancy model; affects Alloy config, Grafana datasources, S3 layout                                                          |
| What alerting targets do teams use? (email, Slack, Teams, RocketChat?) | Needed to configure Grafana Alerting contact points                                                                                     |
| Should execution pruning be enabled and at what retention period?      | Separate from trace retention — affects n8n PostgreSQL DB size                                                                          |
| What is the SLA for the observability stack itself?                    | 99.9% uptime requires HA replicas for Alloy, Tempo distributor, Loki distributor, and Grafana — single-pod deployments are insufficient |
| Are traces operational telemetry or records?                           | If a workflow trace contains a case ID or application reference, retention and security requirements may change significantly           |

---
