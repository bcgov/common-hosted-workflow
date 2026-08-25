# Alert Contract

Every rule added to this directory must satisfy the contract below.
Add one file per service (e.g. `alloy.yaml`, `loki.yaml`).

> **All rules here are provisioned and locked in the Grafana UI.**
> The UI shows a lock icon and blocks edits. Changes must go through Git and a Helm deploy — there is no "quick fix in the UI" path.

---

## Required structural fields

| Field          | Notes                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `uid`          | Stable, unique string (e.g. `n8n-sys-log-errors`). Never reuse — change it if the rule is renamed.           |
| `title`        | Human-readable name shown in Grafana UI and email subject.                                                   |
| `folder`       | Grafana folder. Use `n8n` for all n8n alerts.                                                                |
| `condition`    | Must reference a refId that evaluates to a threshold expression (`datasourceUid: __expr__`).                 |
| `noDataState`  | `OK` for counters/metrics (no data = not running yet). `Alerting` for health-checks (silence = unreachable). |
| `execErrState` | `Error` (recommended default). `OK` only if query errors are expected and benign.                            |
| `for`          | `0s` immediate · `1m` brief stabilisation · `5m` sustained condition required.                               |

## Required annotations

| Annotation    | Notes                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `summary`     | One sentence, plain text, no template vars. Shown in Grafana alert list.                          |
| `description` | Full sentence with metric value. Template vars allowed: `{{ $values.B.Value \| printf "%.0f" }}`. |

## Optional annotations (email-only)

| Annotation          | Category         | Notes                                                                                                                                                         |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow_failures` | `workflow`       | Template range over `$values` to list per-workflow failure counts. Email template renders these under a "Failed workflows" section.                           |
| `error_messages`    | `infrastructure` | Template range over `$values` to list top error messages from a secondary Loki query (refId G). Email template renders these under a "Recent errors" section. |

## Required labels

| Label         | Allowed values                                                      | Notes                                                                                                      |
| ------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `environment` | _(injected)_                                                        | **Do not set manually.** Use `__NAMESPACE__` — Helm replaces it with the release namespace at deploy time. |
| `service`     | `n8n` `alloy` `loki` `tempo` `mimir` `prometheus`                   | Which service this alert monitors.                                                                         |
| `team`        | `platform` `workflows`                                              | Routes the notification. Must exactly match a receiver in `notification-policies.yaml`.                    |
| `severity`    | `critical` `warning`                                                | `critical` = immediate action. `warning` = investigate soon.                                               |
| `category`    | `infrastructure` `workflow` `capacity` `performance` `availability` | Controls email template branching.                                                                         |

### Category guide

| Value            | When to use                               |
| ---------------- | ----------------------------------------- |
| `infrastructure` | Pod crashes, log errors, startup failures |
| `workflow`       | Business-logic execution failures         |
| `capacity`       | Disk / memory / quota exhaustion          |
| `performance`    | Latency or throughput degradation         |
| `availability`   | Service unreachable, replica mismatch     |
