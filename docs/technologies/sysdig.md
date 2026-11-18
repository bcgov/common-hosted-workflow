---
title: Sysdig
sidebar_label: Sysdig
sidebar_position: 9
---

# Sysdig

Sysdig is the monitoring and alerting platform used in this repository for infrastructure-level operational visibility.

In this project, Sysdig is not used as an application deployment tool. It is used as an **operations observability service** to surface cluster health signals and notify operators when resource conditions cross defined thresholds.

## Monitoring Flow

```mermaid
flowchart LR
    OCP[OpenShift Runtime Metrics]
    Sysdig[Sysdig Monitor]
    Dash[Cluster Health Dashboard]
    Alerts[CPU and Memory Alerts]
    Email[Email Notifications]
    Webhook[Webhook Callbacks]

    OCP --> Sysdig
    Sysdig --> Dash
    Sysdig --> Alerts
    Alerts --> Email
    Alerts --> Webhook
```

## Why This Project Uses Sysdig

This platform runs on OpenShift and hosts multi-environment workflow workloads. That makes continuous visibility into runtime health a platform concern, not just an application concern.

The repository uses Sysdig to provide:

- a shared dashboard for environment-level cluster health
- alerting on sustained high CPU utilization
- alerting on sustained high memory utilization
- email notifications to the configured operational recipients
- webhook callbacks to a configured endpoint, when provided

At an architectural level, Sysdig fills the gap between deployment automation and runtime operations:

- GitHub Actions and Helm deliver the platform
- Sysdig monitors whether the running platform is healthy after delivery

## What This Repository Provisions In Sysdig

The Terraform configuration under `terraform/sysdig` currently provisions Sysdig Monitor resources for the `b0c13b` and `c89a45` footprints.

Each workspace instantiates the shared module and passes its own slug, which is used to name and scope the provisioned resources.

The module creates, per workspace:

- a dashboard named `<workspace> Cluster Health`
- an email notification channel
- a webhook notification channel, created only when a webhook URL is configured
- a high CPU Prometheus-style alert
- a high memory Prometheus-style alert

The dashboard includes panels for:

- CPU utilization
- memory usage
- network throughput

The alerts are configured with a 5-minute evaluation window and notify the configured email recipients. When a webhook URL is configured, alerts additionally send a callback to that endpoint.

## How It Is Provisioned

Provisioning is managed with Terraform, not manually through the Sysdig UI.

The entry points are:

- `terraform/sysdig/b0c13b/main.tf`
- `terraform/sysdig/c89a45/main.tf`

Each environment uses the shared Terraform module in:

- `terraform/sysdig/_module`

The module is responsible for defining the reusable Sysdig resources, while the environment layer provides values such as alert recipients and thresholds.

## Terraform Design

The current Terraform design has two layers:

| Layer                      | Purpose                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `terraform/sysdig/_module` | reusable Sysdig dashboard, notification channel, and alert definitions                   |
| `terraform/sysdig/b0c13b`  | environment-specific instantiation, provider config, backend config, and variable wiring |
| `terraform/sysdig/c89a45`  | environment-specific instantiation, provider config, backend config, and variable wiring |

This separation keeps the Sysdig resource model reusable while still allowing per-environment customization.

## State And Credentials

The Sysdig Terraform state is stored using the Kubernetes backend, one state per workspace:

- `b0c13b`: namespace `b0c13b-tools`
- `c89a45`: namespace `c89a45-tools`
- secret suffix: `sysdig-state`

The Sysdig provider authenticates with:

- `TF_VAR_sysdig_monitor_api_token`

Alert recipients are passed through:

- `TF_VAR_alert_email_recipients`

An optional webhook callback URL is passed through:

- `TF_VAR_alert_webhook_url`

When unset (or empty), the webhook notification channel is not created and alerts notify through email only.

The webhook Authorization header is passed through:

- `TF_VAR_alert_webhook_authorization`

It is mandatory whenever a webhook URL is configured; provisioning fails with a validation error otherwise.

The GitHub Actions workflows map these Terraform variables from secrets in each workspace's GitHub environment (`sysdig` for `b0c13b`, `standard-sysdig` for `c89a45`):

| Terraform variable            | GitHub secret                 |
| ----------------------------- | ----------------------------- |
| `sysdig_monitor_api_token`    | `SYSDIG_MONITOR_API_TOKEN`    |
| `alert_email_recipients`      | `ALERT_EMAIL_RECIPIENTS`      |
| `alert_webhook_url`           | `ALERT_WEBHOOK_URL`           |
| `alert_webhook_authorization` | `ALERT_WEBHOOK_AUTHORIZATION` |

The OpenShift login used to reach the Kubernetes state backend reads `OPENSHIFT_SERVER` and `OPENSHIFT_TOKEN` from the same environment.

This keeps secrets out of the repository and aligns provisioning with the GitHub Actions environment model.

## Delivery Automation

Sysdig provisioning is automated through GitHub Actions workflows, one per workspace:

| Workspace | Workflow                                          | GitHub environment |
| --------- | ------------------------------------------------- | ------------------ |
| `b0c13b`  | `.github/workflows/sysdig-terraform.yml`          | `sysdig`           |
| `c89a45`  | `.github/workflows/sysdig-terraform-standard.yml` | `standard-sysdig`  |

Each workflow's behavior is:

- on pull requests touching that workspace or the shared module (`terraform/sysdig/_module/**`): run `terraform plan`
- on pushes to `main` touching the same paths: run `terraform apply`
- on manual dispatch: allow either `plan` or `apply`

The plan workflows also post the Terraform plan back to the pull request, which makes Sysdig monitoring changes reviewable before they are applied.

## Current Scope

The current repository implementation is intentionally small and focused.

It provisions:

- baseline resource health monitoring
- baseline email-based alerting
- optional webhook callback notifications

It does not currently provision, in this repository at least:

- complex service maps
- incident routing integrations beyond email and webhook callbacks
- large policy libraries
- broad multi-environment Sysdig stacks beyond the current Terraform entry point

Team and membership management is also outside the Terraform scope. Sysdig teams, their namespace
scoping, and user access are managed separately through the `SysdigTeam` custom resource — see
[Sysdig Team Management](../operations/sysdig-team-management.md).

## Key Source Files

- `terraform/sysdig/b0c13b/main.tf`
- `terraform/sysdig/b0c13b/config.tf`
- `terraform/sysdig/c89a45/main.tf`
- `terraform/sysdig/c89a45/config.tf`
- `terraform/sysdig/_module/main.tf`
- `terraform/sysdig/_module/variables.tf`
- `terraform/sysdig/_module/outputs.tf`
- `.github/workflows/sysdig-terraform.yml`
- `.github/workflows/sysdig-terraform-standard.yml`
