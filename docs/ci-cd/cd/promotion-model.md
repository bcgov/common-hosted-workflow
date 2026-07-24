---
title: Promotion Model
sidebar_label: Promotion Model
sidebar_position: 1
---

# Promotion Model

Application delivery follows a progressive promotion model driven by Git events and GitHub Releases.

## Promotion Flow

| Stage | Trigger                  | Image tag used                       | Primary workflow  |
| ----- | ------------------------ | ------------------------------------ | ----------------- |
| Dev   | Push to `main`           | `github.sha`                         | `deploy-dev.yml`  |
| Test  | Push tag `v*.*.*`        | semantic version without leading `v` | `deploy-test.yml` |
| Prod  | Published GitHub release | release tag without leading `v`      | `deploy-prod.yml` |

This creates a clear separation of concerns:

- `main` validates integration and continuously refreshes dev.
- Git tags create immutable versioned artifacts for test.
- GitHub Releases act as the approval boundary for prod.

## Image Tagging Strategy

The reusable build workflow, [`_build-and-push.yml`](../../../.github/workflows/_build-and-push.yml), publishes images to `ghcr.io`.

By default it emits branch and long-SHA metadata tags. Test releases override that behavior and publish semver tags.

Operationally, the important rule is simple: deployments promote **image tags**, not Helm chart versions.

## Deployment Streams

There are two top-level application deployment streams:

| Stream   | Workflow              | Notes                                                                 |
| -------- | --------------------- | --------------------------------------------------------------------- |
| Standard | `deploy-standard.yml` | Used by automated dev, test, and prod promotion                       |
| DevX     | `deploy-devx.yml`     | Reusable and manually invokable deployment lane for DevX environments |

Both streams call the same reusable deploy implementation, [`_deploy.yml`](../../../.github/workflows/_deploy.yml), which performs the OpenShift login and Helm upgrade.

## Environment Resolution

The workflow input `environment` maps to a GitHub Environment, for example:

- `standard-dev`
- `standard-test`
- `standard-prod`
- `standard-devdr`
- `standard-testdr`
- `standard-proddr`
- `devx-dev`
- `devx-test`
- `devx-prod`
- `devx-devdr`
- `devx-testdr`
- `devx-proddr`

Those GitHub Environments provide the runtime contract:

- `OPENSHIFT_SERVER`
- `OPENSHIFT_TOKEN`
- `vars.OPENSHIFT_NAMESPACE`

This is an important architectural choice: deployment workflows remain generic, while environment-specific targeting is externalized to GitHub Environment configuration.

## Namespace And Cluster Overlay Model

Helm overlays are selected by the combination of:

- `NAMESPACE`
- `CLUSTER`

The main chart loads:

```text
values.yaml
values-<namespace>-<cluster>.yaml
```

Current overlays show two active cluster variants:

- `gold`
- `golddr`

The Helm Makefiles still mention `silver`, but the repository workflows and overlay files currently operate on `gold` and `golddr`.

## DR Behavior

Primary and DR clusters are not symmetrical in behavior.

Typical GoldDR patterns in the overlays include:

- trigger-style n8n nodes excluded from runtime
- backup creation disabled on DR
- optional conditional restore from S3-backed backups
- optional DNS probe integration for failover-aware recovery

This means DR is not just another copy of prod. It is a controlled standby posture expressed directly in Helm values.

For the service-level failover behavior, user traffic routing model, and DR data constraints, see [Gold And GoldDR Failover Model](../../platform/gold-dr-failover.md).

## Manual Deployment Guidance

The manually invokable deploy workflows accept an image `tag` input and default it to `latest`.

From an operations perspective, using an explicit known tag is safer:

- dev deployments normally use a commit SHA
- test and prod deployments normally use release versions

Prefer specifying the intended SHA or semantic version when running manual deployments.
